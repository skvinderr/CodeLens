import { useCallback, useEffect, useMemo, useRef } from 'react'
import { wrap } from 'comlink'
import { GitHubError, GitHubFetcher } from '@/lib/github/fetcher'
import { parseGitHubTree } from '@/lib/github/parser'
import { calculateBlastRadius } from '@/lib/graph/blastRadius'
import { useGitHub } from '@/hooks/useGitHub'
import { useAppStore } from '@/store/useAppStore'
import type {
  AnalysisResult,
  AnalysisStage,
  AppStatus,
  FileContributors,
  FileNode,
  HealthScore,
  RepoInfo,
  SecurityFinding,
  TechStack,
} from '@/types'
import type { AnalysisWorkerApi, WorkerFileInput } from '@/workers/analysis.worker'

export interface UseAnalysisResult {
  status: AppStatus
  findings: SecurityFinding[]
  health: HealthScore | null
  runAnalysis: (repoOverride?: string) => Promise<void>
  skipContributors: () => void
}

export function useAnalysis(): UseAnalysisResult {
  const mode = useAppStore((state) => state.mode)
  const repoInput = useAppStore((state) => state.repoInput)
  const analysisResult = useAppStore((state) => state.analysisResult)
  const setAnalysisResult = useAppStore((state) => state.setAnalysisResult)
  const setError = useAppStore((state) => state.setError)
  const setWarning = useAppStore((state) => state.setWarning)
  const setMode = useAppStore((state) => state.setMode)
  const updateStage = useAppStore((state) => state.updateStage)
  const setStages = useAppStore((state) => state.setStages)
  const { token, beginRequestBatch, handleGitHubError } = useGitHub()

  const workerRef = useRef<RemoteWorker | null>(null)
  const workerInstanceRef = useRef<Worker | null>(null)
  const skipContributorsRef = useRef(false)
  const runTokenRef = useRef(0)

  const findings = analysisResult?.security ?? []
  const health = analysisResult?.health ?? null

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    const api = wrap<AnalysisWorkerApi>(worker)
    workerRef.current = api
    workerInstanceRef.current = worker

    const onMessage = (event: MessageEvent<{ type?: string; stage?: string; current?: number; total?: number; filename?: string }>) => {
      if (event.data?.type !== 'progress' || !event.data.stage) {
        return
      }

      const progress = event.data.total
        ? Math.round(((event.data.current ?? 0) / Math.max(1, event.data.total)) * 100)
        : undefined

      const id = stageIdFromWorkerStage(event.data.stage)
      if (!id) {
        return
      }

      updateStage(id, {
        status: 'running',
        current: event.data.current,
        total: event.data.total,
        currentFile: event.data.filename,
        detail:
          typeof event.data.current === 'number' && typeof event.data.total === 'number'
            ? `Reading file ${event.data.current} / ${event.data.total}${event.data.filename ? ` - ${event.data.filename}` : ''}`
            : event.data.filename,
        progress,
      })
    }

    worker.addEventListener('message', onMessage)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
      workerRef.current = null
      workerInstanceRef.current = null
    }
  }, [updateStage])

  const runAnalysis = useCallback(
    async (repoOverride?: string) => {
      const rawRepo = (repoOverride ?? repoInput).trim()
      if (!rawRepo) {
        setError('Repository is required.')
        return
      }

      setMode('loading')
      setError(null)
      setWarning(null)
      skipContributorsRef.current = false
      setStages(createDefaultStages())
      const runToken = runTokenRef.current + 1
      runTokenRef.current = runToken

      try {
        const abortController = beginRequestBatch()
        const isRunStale = () =>
          abortController.signal.aborted || runTokenRef.current !== runToken

        const fetcher = new GitHubFetcher(token || undefined, abortController.signal)
        const repoUrl = normalizeRepositoryInput(rawRepo)

        updateStage('repo', { status: 'running', startedAt: Date.now() })
        const repo = await fetcher.parseRepoUrl(repoUrl)
        if (isRunStale()) {
          return
        }
        updateStage('repo', { status: 'done' })

        updateStage('tree', { status: 'running', startedAt: Date.now() })
        const tree = await fetcher.getFileTree(repo)
        if (isRunStale()) {
          return
        }
        updateStage('tree', { status: 'done', current: tree.length, total: tree.length })
        if (fetcher.wasTreeTrimmed()) {
          handleGitHubError(
            new GitHubError('TOO_LARGE', 'Repository has too many files.'),
          )
        }

        if (tree.length === 0) {
          const emptyResult = createEmptyResult(repo)
          setAnalysisResult(emptyResult)
          return
        }

        updateStage('read-contents', { status: 'running', startedAt: Date.now() })
        const fileInputs = await loadFileInputs(
          fetcher,
          repo,
          tree.map((entry) => entry.path),
          abortController.signal,
          (current, total, filename) => {
            updateStage('read-contents', {
              status: 'running',
              current,
              total,
              currentFile: filename,
              progress: total > 0 ? Math.round((current / total) * 100) : 0,
              detail: `Reading file ${current} / ${total} - ${filename}`,
            })
          },
        )
        if (isRunStale()) {
          return
        }
        updateStage('read-contents', { status: 'done', progress: 100 })

        const worker = workerRef.current
        if (!worker) {
          throw new Error('Analysis worker is not available.')
        }

        const files = await worker.parseFiles(fileInputs)
        if (isRunStale()) {
          return
        }
        updateStage('graph', { status: 'running', startedAt: Date.now() })
        const graph = await worker.buildDependencyGraph(files)
        if (isRunStale()) {
          return
        }
        updateStage('graph', { status: 'done' })
        hydrateBlastScores(graph)

        updateStage('contributors', { status: 'running', startedAt: Date.now() })
        const contributors = await loadContributors(
          fetcher,
          repo,
          files,
          abortController.signal,
          () => skipContributorsRef.current,
          (current, total, filename) => {
            updateStage('contributors', {
              status: 'running',
              current,
              total,
              currentFile: filename,
              detail: `Fetching contributor history ${current} / ${total} - ${filename}`,
            })
          },
        )
        if (isRunStale()) {
          return
        }
        updateStage('contributors', {
          status: skipContributorsRef.current ? 'error' : 'done',
          detail: skipContributorsRef.current ? 'Contributor fetch skipped' : undefined,
        })

        const techStack = buildTechStack(files)
        const fileTree = parseGitHubTree(tree)
        void fileTree

        const baseResult: AnalysisResult = {
          repo,
          files,
          graph,
          contributors,
          health: {
            overall: 0,
            grade: 'F',
            categories: {
              dependencies: 0,
              security: 0,
              complexity: 0,
              documentation: 0,
              testCoverage: 0,
              codeSmells: 0,
            },
            breakdown: [],
            topIssues: [],
            improvements: [],
          },
          security: await worker.scanAll(files),
          circularDeps: [],
          techStack,
          analyzedAt: new Date(),
          skippedFiles: files
            .filter((file) => file.contentUnavailable)
            .map((file) => file.path),
        }

        const result: AnalysisResult = {
          ...baseResult,
          health: await worker.computeHealthScore(baseResult),
        }
        if (isRunStale()) {
          return
        }

        updateStage('security', { status: 'done' })
        updateStage('health', { status: 'done' })
        setAnalysisResult(result)
      } catch (error) {
        if (isAbortError(error)) {
          return
        }
        handleGitHubError(error)
      }
    },
    [
      beginRequestBatch,
      handleGitHubError,
      repoInput,
      setAnalysisResult,
      setError,
      setMode,
      setStages,
      setWarning,
      token,
      updateStage,
    ],
  )

  const skipContributors = useCallback(() => {
    skipContributorsRef.current = true
  }, [])

  return useMemo(
    () => ({
      status: {
        message:
          mode === 'loading'
            ? 'Analyzing repository...'
            : mode === 'ready'
              ? analysisResult?.skippedFiles?.length
                ? `Analysis complete - ${analysisResult.skippedFiles.length} files skipped due to errors`
                : 'Analysis complete'
              : 'Analysis has not started',
        kind: mode,
      },
      findings,
      health,
      runAnalysis,
      skipContributors,
    }),
    [analysisResult?.skippedFiles?.length, findings, health, mode, runAnalysis, skipContributors],
  )
}

type RemoteWorker = AnalysisWorkerApi

async function loadFileInputs(
  fetcher: GitHubFetcher,
  repo: RepoInfo,
  paths: string[],
  signal: AbortSignal,
  onProgress: (current: number, total: number, fileName: string) => void,
): Promise<WorkerFileInput[]> {
  const filesPerSecondTracker = { startedAt: performance.now() }
  const files: WorkerFileInput[] = []

  for (const [index, path] of paths.entries()) {
    throwIfAborted(signal)

    let content = ''
    let contentUnavailable = false
    let warning: string | undefined

    try {
      content = (await fetcher.getFileContent(repo, path)) ?? ''
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      contentUnavailable = true
      warning = 'Content unavailable'
    }

    onProgress(index + 1, paths.length, path)
    void filesPerSecondTracker
    files.push({
      path,
      content,
      size: content.length,
      contentUnavailable,
      warning,
    })
  }

  return files
}

function hydrateBlastScores(result: AnalysisResult['graph']): void {
  for (const node of result.nodes) {
    const blast = calculateBlastRadius(node.id, result, 4)
    node.blastScore = blast.score
  }
}

async function loadContributors(
  fetcher: GitHubFetcher,
  repo: RepoInfo,
  files: FileNode[],
  signal: AbortSignal,
  shouldSkip: () => boolean,
  onProgress: (current: number, total: number, fileName: string) => void,
): Promise<Map<string, FileContributors>> {
  const contributors = new Map<string, FileContributors>()
  const candidateFiles = files.filter((file) => !file.contentUnavailable).slice(0, 60)

  for (const [index, file] of candidateFiles.entries()) {
    throwIfAborted(signal)

    if (shouldSkip()) {
      break
    }

    onProgress(index + 1, candidateFiles.length, file.path)
    try {
      const fileContributors = await fetcher.getContributors(repo, file.path)
      contributors.set(file.path, {
        filePath: file.path,
        contributors: fileContributors,
        totalCommits: fileContributors.reduce((sum, contributor) => sum + contributor.commits, 0),
      })
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      continue
    }
  }

  return contributors
}

function normalizeRepositoryInput(input: string): string {
  const trimmed = input.trim().replace(/^git\+/, '')

  if (/^git@github\.com:/i.test(trimmed)) {
    const repoPath = trimmed.replace(/^git@github\.com:/i, '')
    return `https://github.com/${repoPath.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')}`
  }

  if (/^ssh:\/\/git@github\.com\//i.test(trimmed)) {
    const repoPath = trimmed.replace(/^ssh:\/\/git@github\.com\//i, '')
    return `https://github.com/${repoPath.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')}`
  }

  if (/^git:\/\/github\.com\//i.test(trimmed)) {
    const repoPath = trimmed.replace(/^git:\/\/github\.com\//i, '')
    return `https://github.com/${repoPath.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')}`
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('github.com/')) {
    return trimmed
  }

  return `https://github.com/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Request aborted', 'AbortError')
  }
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    String((error as { name?: string }).name) === 'AbortError'
  )
}

function createDefaultStages(): AnalysisStage[] {
  return [
    { id: 'repo', label: 'Load repository metadata', status: 'pending' },
    { id: 'tree', label: 'Read repository tree', status: 'pending' },
    { id: 'read-contents', label: 'Reading file contents', status: 'pending', progress: 0 },
    { id: 'contributors', label: 'Fetch contributors', status: 'pending' },
    { id: 'graph', label: 'Build dependency graph', status: 'pending' },
    { id: 'security', label: 'Run security scan', status: 'pending' },
    { id: 'health', label: 'Compute health score', status: 'pending' },
  ]
}

function stageIdFromWorkerStage(stage: string): string | null {
  switch (stage) {
    case 'read-contents':
      return 'read-contents'
    case 'graph':
      return 'graph'
    case 'security':
      return 'security'
    case 'health':
      return 'health'
    default:
      return null
  }
}

function createEmptyResult(repo: RepoInfo): AnalysisResult {
  return {
    repo,
    files: [],
    graph: { nodes: [], links: [], edges: [] },
    contributors: new Map(),
    health: {
      overall: 0,
      grade: 'F',
      categories: {
        dependencies: 0,
        security: 0,
        complexity: 0,
        documentation: 0,
        testCoverage: 0,
        codeSmells: 0,
      },
      breakdown: [],
      topIssues: [],
      improvements: [],
    },
    security: [],
    circularDeps: [],
    techStack: {
      frameworks: [],
      languages: {},
      hasTests: false,
      hasCI: false,
      hasDocs: false,
    },
    analyzedAt: new Date(),
    skippedFiles: [],
  }
}

function buildTechStack(files: FileNode[]): TechStack {
  const frameworks = new Set<string>()
  const languages: Record<string, number> = {}
  let packageManager: string | undefined
  let hasTests = false
  let hasCI = false
  let hasDocs = false

  for (const file of files) {
    const language = file.language || file.extension || 'unknown'
    languages[language] = (languages[language] ?? 0) + 1

    const lowerPath = file.path.toLowerCase()
    const lowerName = file.name.toLowerCase()
    const content = file.content ?? ''

    if (/(^|\/)(__tests__|tests)\//.test(lowerPath) || /\.(test|spec)\./.test(lowerPath)) {
      hasTests = true
    }
    if (lowerPath.startsWith('.github/workflows/') || lowerName === '.travis.yml') {
      hasCI = true
    }
    if (lowerName === 'readme.md' || lowerName === 'docs') {
      hasDocs = true
    }

    if (lowerName === 'package.json') {
      packageManager = packageManager ?? 'npm'
      if (/\"react\"/.test(content)) frameworks.add('React')
      if (/\"vue\"/.test(content)) frameworks.add('Vue')
      if (/\"next\"/.test(content)) frameworks.add('Next.js')
      if (/\"vite\"/.test(content)) frameworks.add('Vite')
      if (/\"vitest\"/.test(content)) frameworks.add('Vitest')
      if (/\"jest\"/.test(content)) frameworks.add('Jest')
    }
    if (lowerName === 'pnpm-lock.yaml' || lowerName === 'pnpm-lock.yml') {
      packageManager = 'pnpm'
    }
    if (lowerName === 'yarn.lock') {
      packageManager = 'yarn'
    }
    if (lowerName === 'package-lock.json') {
      packageManager = 'npm'
    }
  }

  return {
    frameworks: [...frameworks],
    languages,
    packageManager,
    hasTests,
    hasCI,
    hasDocs,
  }
}
