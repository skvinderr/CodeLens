import { useCallback, useMemo } from 'react'
import { computeHealthScore } from '@/lib/analysis/healthScorer'
import { parseImports } from '@/lib/analysis/importParser'
import { SecurityScanner } from '@/lib/analysis/securityScanner'
import { GitHubFetcher } from '@/lib/github/fetcher'
import { parseGitHubTree } from '@/lib/github/parser'
import { buildDependencyGraph } from '@/lib/graph/buildGraph'
import { calculateBlastRadius } from '@/lib/graph/blastRadius'
import { useAppStore } from '@/store/useAppStore'
import type {
  AnalysisResult,
  AppStatus,
  FileContributors,
  FileNode,
  HealthScore,
  RepoInfo,
  SecurityFinding,
  TechStack,
} from '@/types'

export interface UseAnalysisResult {
  status: AppStatus
  findings: SecurityFinding[]
  health: HealthScore | null
  runAnalysis: (repoOverride?: string) => Promise<void>
}

export function useAnalysis(): UseAnalysisResult {
  const mode = useAppStore((state) => state.mode)
  const repoInput = useAppStore((state) => state.repoInput)
  const token = useAppStore((state) => state.githubToken)
  const analysisResult = useAppStore((state) => state.analysisResult)
  const setAnalysisResult = useAppStore((state) => state.setAnalysisResult)
  const setError = useAppStore((state) => state.setError)
  const setMode = useAppStore((state) => state.setMode)

  const findings = analysisResult?.security ?? []
  const health = analysisResult?.health ?? null

  const runAnalysis = useCallback(
    async (repoOverride?: string) => {
      const rawRepo = (repoOverride ?? repoInput).trim()
      if (!rawRepo) {
        setError('Repository is required.')
        return
      }

      setMode('loading')
      setError(null)

      try {
        const fetcher = new GitHubFetcher(token || undefined)
        const repoUrl = /^https?:\/\//i.test(rawRepo) || rawRepo.includes('github.com/')
          ? rawRepo
          : `https://github.com/${rawRepo.replace(/^\/+|\/+$/g, '')}`

        const repo = await fetcher.parseRepoUrl(repoUrl)
        const tree = await fetcher.getFileTree(repo)
        const files = await loadFiles(fetcher, repo, tree.map((entry) => entry.path))
        const graph = buildDependencyGraph(files)
        hydrateBlastScores(graph)

        const contributors = new Map<string, FileContributors>()
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
          security: new SecurityScanner().scanAll(files),
          circularDeps: [],
          techStack,
          analyzedAt: new Date(),
        }

        const result: AnalysisResult = {
          ...baseResult,
          health: computeHealthScore(baseResult),
        }

        setAnalysisResult(result)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to analyze repository.'
        setError(message)
      }
    },
    [repoInput, setAnalysisResult, setError, setMode, token],
  )

  return useMemo(
    () => ({
      status: {
        message:
          mode === 'loading'
            ? 'Analyzing repository...'
            : mode === 'ready'
              ? 'Analysis complete'
              : 'Analysis has not started',
        kind: mode,
      },
      findings,
      health,
      runAnalysis,
    }),
    [findings, health, mode, runAnalysis],
  )
}

async function loadFiles(
  fetcher: GitHubFetcher,
  repo: RepoInfo,
  paths: string[],
): Promise<FileNode[]> {
  const files = await Promise.all(
    paths.map(async (path) => {
      const content = (await fetcher.getFileContent(repo, path)) ?? ''
      const parsed = parseImports(content, path)
      const extension = path.includes('.') ? path.split('.').pop() ?? '' : ''
      const fileName = path.split('/').pop() ?? path

      return {
        id: path,
        path,
        name: fileName,
        extension,
        language: parsed.language,
        size: content.length,
        content,
        imports: parsed.imports.map((entry) =>
          entry.type === 'dynamic' ? `${entry.path}` : entry.path,
        ),
        exports: parsed.exports.map((entry) => entry.name),
        lineCount: parsed.lineCount,
      } satisfies FileNode
    }),
  )

  return files
}

function hydrateBlastScores(result: AnalysisResult['graph']): void {
  for (const node of result.nodes) {
    const blast = calculateBlastRadius(node.id, result, 4)
    node.blastScore = blast.score
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
