import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { BlastRadiusPanel } from '@/components/panels/BlastRadiusPanel'
import { ContributorsPanel } from '@/components/panels/ContributorsPanel'
import { FileTreePanel } from '@/components/panels/FileTreePanel'
import { HealthPanel } from '@/components/panels/HealthPanel'
import { SecurityPanel } from '@/components/panels/SecurityPanel'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressOverlay } from '@/components/ui/ProgressOverlay'
import { TokenInput } from '@/components/ui/TokenInput'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useGitHub } from '@/hooks/useGitHub'
import { useGraph } from '@/hooks/useGraph'
import { analyzeBusFactor } from '@/lib/analysis/busFactor'
import type { RepositoryTreeEntry } from '@/lib/github/fetcher'
import { parseGitHubTree } from '@/lib/github/parser'
import { computeHealthScore } from '@/lib/analysis/healthScorer'
import { calculateBlastRadius } from '@/lib/graph/blastRadius'
import { useAppStore } from '@/store/useAppStore'
import type {
  CodeLensFileNode,
  Contributor,
  FileContributors,
  GraphNode,
} from '@/types'

const PLACEHOLDER_FILES: CodeLensFileNode[] = [
  {
    id: 'dir-src',
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      {
        id: 'file-app',
        name: 'App.tsx',
        path: 'src/App.tsx',
        type: 'file',
        extension: 'tsx',
      },
    ],
  },
]

const PLACEHOLDER_CONTRIBUTORS: Contributor[] = [
  {
    login: 'alexrivera',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
    commits: 24,
    additions: 510,
    deletions: 180,
    lastCommit: new Date(),
  },
  {
    login: 'jordanlee',
    avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
    commits: 17,
    additions: 332,
    deletions: 141,
    lastCommit: new Date(),
  },
]

const REPO_EXAMPLES = [
  'github.com/facebook/react',
  'vercel/next.js',
  'microsoft/TypeScript',
]

function App() {
  const [isOverlayVisible, setIsOverlayVisible] = useState(false)

  const mode = useAppStore((state) => state.mode)
  const error = useAppStore((state) => state.error)
  const warning = useAppStore((state) => state.warning)
  const repoInput = useAppStore((state) => state.repoInput)
  const setRepoInput = useAppStore((state) => state.setRepoInput)
  const selectNode = useAppStore((state) => state.selectNode)
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const analysisResult = useAppStore((state) => state.analysisResult)
  const stages = useAppStore((state) => state.stages)
  const theme = useAppStore((state) => state.theme)
  const toggleTheme = useAppStore((state) => state.toggleTheme)

  const { graph } = useGraph()
  const { token, setToken, isConfigured, abortActiveRequests } = useGitHub()
  const { status: analysisStatus, findings, health, runAnalysis, skipContributors } =
    useAnalysis()

  const graphForBlast = analysisResult?.graph ?? graph

  const resolvedFileTree = useMemo(() => {
    if (!analysisResult || analysisResult.files.length === 0) {
      return PLACEHOLDER_FILES
    }

    const entries: RepositoryTreeEntry[] = analysisResult.files.map((file) => ({
      path: file.path,
      type: 'blob',
      size: file.size,
    }))

    return parseGitHubTree(entries)
  }, [analysisResult])

  const selectedNode = useMemo<GraphNode | null>(() => {
    if (!selectedNodeId) {
      return null
    }

    return graphForBlast.nodes.find((node) => node.id === selectedNodeId) ?? null
  }, [graphForBlast.nodes, selectedNodeId])

  const fallbackContributorsByFile = useMemo(() => {
    if (!selectedNode) {
      return null
    }

    const filePath = selectedNode.path || selectedNode.filePath || selectedNode.id
    const totalCommits = PLACEHOLDER_CONTRIBUTORS.reduce(
      (sum, contributor) => sum + contributor.commits,
      0,
    )

    return new Map<string, FileContributors>([
      [
        filePath,
        {
          filePath,
          contributors: PLACEHOLDER_CONTRIBUTORS,
          totalCommits,
        },
      ],
    ])
  }, [selectedNode])

  const contributorsByFile =
    analysisResult?.contributors && analysisResult.contributors.size > 0
      ? analysisResult.contributors
      : fallbackContributorsByFile

  const resolvedSecurityFindings =
    findings.length > 0 ? findings : analysisResult?.security ?? []

  const busFactor = useMemo(() => {
    if (!analysisResult || analysisResult.contributors.size === 0) {
      return null
    }

    return analyzeBusFactor(analysisResult.graph.nodes, analysisResult.contributors)
  }, [analysisResult])

  const computedHealth = useMemo(() => {
    if (!analysisResult) {
      return null
    }

    return computeHealthScore(analysisResult)
  }, [analysisResult])

  const resolvedHealth = health ?? computedHealth ?? analysisResult?.health ?? null

  const blastRadiusResult = useMemo(() => {
    if (!selectedNodeId || graphForBlast.nodes.length === 0) {
      return null
    }

    return calculateBlastRadius(selectedNodeId, graphForBlast, 4)
  }, [graphForBlast, selectedNodeId])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (mode === 'loading') {
      setIsOverlayVisible(true)
    }
  }, [mode])

  const statusMessage = useMemo(() => {
    if (error) {
      return error
    }

    const modeLabelMap: Record<typeof mode, string> = {
      idle: 'Idle',
      loading: 'Loading',
      ready: 'Ready',
      error: 'Error',
    }

    return `Mode: ${modeLabelMap[mode]}`
  }, [error, mode])

  const analysisSummary = useMemo(() => {
    if (!analysisResult) {
      return null
    }

    return `${analysisResult.repo.owner}/${analysisResult.repo.name} · ${analysisResult.files.length} files · ${analysisResult.graph.nodes.length} nodes`
  }, [analysisResult])

  const handleSubmitAnalysis = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAnalysis(repoInput)
  }

  return (
    <div className="app-shell">
      <Navbar
        appName="CodeLens"
        sourceLabel="Browser-based code intelligence"
        onToggleTheme={toggleTheme}
      />

      <main className="app-main">
        <Sidebar title="Repository Input">
          <section className="repo-intro-card" aria-label="Repository setup">
            <p className="repo-intro-kicker">Step 1</p>
            <h3>Paste your GitHub repository</h3>
            <p>
              Enter a GitHub URL or owner/repo slug, then run analysis.
            </p>
          </section>

          <form className="repo-form" onSubmit={handleSubmitAnalysis}>
            <label className="repo-input" htmlFor="repo-url">
              <span className="repo-input-label">Repository URL</span>
              <input
                id="repo-url"
                className="repo-input-field"
                type="text"
                value={repoInput}
                placeholder="https://github.com/owner/repo"
                autoComplete="off"
                onChange={(event) => setRepoInput(event.target.value)}
              />
            </label>

            <div className="repo-example-row" aria-label="Repository examples">
              {REPO_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="repo-example-chip"
                  onClick={() => setRepoInput(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            <TokenInput
              id="github-token"
              label="GitHub Token (recommended for rate limits)"
              value={token}
              placeholder="ghp_..."
              onChange={setToken}
            />

            <div className="repo-actions">
              <Button
                variant="primary"
                type="submit"
                disabled={mode === 'loading' || repoInput.trim().length === 0}
              >
                {mode === 'loading' ? 'Analyzing...' : 'Analyze Repository'}
              </Button>
              <Button
                variant="ghost"
                onClick={abortActiveRequests}
                disabled={mode !== 'loading'}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsOverlayVisible((current) => !current)}
              >
                Progress
              </Button>
            </div>

            <p className="repo-hint">
              {isConfigured
                ? 'Token detected: higher API rate limits enabled.'
                : 'No token detected. Public analysis works, but API rate limits are lower.'}
            </p>

            {warning ? (
              <p className="repo-banner is-warning" role="status">
                {warning}
              </p>
            ) : null}

            {error ? (
              <p className="repo-banner is-error" role="alert">
                {error}
              </p>
            ) : null}

            {analysisSummary ? (
              <p className="repo-banner is-success" role="status">
                Loaded: {analysisSummary}
              </p>
            ) : null}
          </form>

          <FileTreePanel files={resolvedFileTree} />
        </Sidebar>

        <section className="workspace-column">
          {graph.nodes.length === 0 ? (
            <EmptyState
              title="No Graph Yet"
              description="Paste a GitHub repository in the left panel, then click Analyze Repository."
            />
          ) : (
            <GraphCanvas nodes={graph.nodes} edges={graph.edges} />
          )}

          <StatusBar
            message={`${statusMessage} | ${analysisStatus.message}`}
            kind={mode}
          />
        </section>

        <Sidebar title="Insights">
          <ContributorsPanel
            selectedNode={selectedNode}
            contributorsByFile={contributorsByFile}
            fallbackContributors={PLACEHOLDER_CONTRIBUTORS}
          />
          <HealthPanel
            score={resolvedHealth}
            busFactor={busFactor}
            techStack={analysisResult?.techStack ?? null}
            analyzedAt={analysisResult?.analyzedAt ?? null}
            onReanalyze={runAnalysis}
            isReanalyzing={mode === 'loading'}
          />
          <SecurityPanel findings={resolvedSecurityFindings} />
          <BlastRadiusPanel
            result={blastRadiusResult}
            nodes={graphForBlast.nodes}
            onSelectNode={selectNode}
          />
        </Sidebar>
      </main>

      <ProgressOverlay
        isVisible={isOverlayVisible}
        repo={analysisResult?.repo ?? null}
        stages={stages}
        onCancel={abortActiveRequests}
        onSkipContributors={skipContributors}
        onViewResults={() => setIsOverlayVisible(false)}
      />
    </div>
  )
}

export default App
