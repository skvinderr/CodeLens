import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { computeHealthScore } from '@/lib/analysis/healthScorer'
import { calculateBlastRadius } from '@/lib/graph/blastRadius'
import { useAppStore } from '@/store/useAppStore'
import { exportGraphPNG, exportJSON } from '@/utils/exportUtils'
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

function App() {
  const [isOverlayVisible, setIsOverlayVisible] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false)
  const hasAutoRunRef = useRef(false)

  const mode = useAppStore((state) => state.mode)
  const error = useAppStore((state) => state.error)
  const selectNode = useAppStore((state) => state.selectNode)
  const clearSelection = useAppStore((state) => state.clearSelection)
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const analysisResult = useAppStore((state) => state.analysisResult)
  const theme = useAppStore((state) => state.theme)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const repoInput = useAppStore((state) => state.repoInput)
  const setRepoInput = useAppStore((state) => state.setRepoInput)
  const sidebarPanel = useAppStore((state) => state.sidebarPanel)
  const setSidebarPanel = useAppStore((state) => state.setSidebarPanel)
  const graphLayout = useAppStore((state) => state.graphLayout)
  const setGraphLayout = useAppStore((state) => state.setGraphLayout)

  const { graph } = useGraph()
  const { token, setToken } = useGitHub()
  const { status: analysisStatus, findings, health, runAnalysis } = useAnalysis()

  const graphForBlast = analysisResult?.graph ?? graph

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
    if (!toastMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setToastMessage(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  useEffect(() => {
    const repo = searchParams.get('repo')?.trim() ?? ''
    const branch = searchParams.get('branch')?.trim() ?? ''

    if (!repo) {
      hasAutoRunRef.current = false
      return
    }

    const targetRepo = branch ? `https://github.com/${repo}/tree/${branch}` : repo
    if (repoInput !== targetRepo) {
      setRepoInput(targetRepo)
    }

    if (!hasAutoRunRef.current) {
      hasAutoRunRef.current = true
      void runAnalysis(targetRepo)
    }
  }, [repoInput, runAnalysis, searchParams, setRepoInput])

  useEffect(() => {
    const file = searchParams.get('file')?.trim() ?? ''
    if (!analysisResult || !file) {
      return
    }

    const matchedNode = analysisResult.graph.nodes.find((node) => {
      const path = node.path || node.filePath || node.id
      return path === file
    })

    if (matchedNode && matchedNode.id !== selectedNodeId) {
      selectNode(matchedNode.id)
    }
  }, [analysisResult, searchParams, selectNode, selectedNodeId])

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)
    const repo = analysisResult?.repo

    if (repo) {
      nextParams.set('repo', `${repo.owner}/${repo.name}`)
      nextParams.set('branch', repo.branch || repo.defaultBranch)
    } else {
      nextParams.delete('repo')
      nextParams.delete('branch')
    }

    const selectedPath =
      selectedNode?.path || selectedNode?.filePath || (selectedNode ? selectedNode.id : '')

    if (selectedPath) {
      nextParams.set('file', selectedPath)
    } else {
      nextParams.delete('file')
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [analysisResult, searchParams, selectedNode, setSearchParams])

  useEffect(() => {
    const layoutOrder = ['force', 'radial', 'hierarchical', 'cluster'] as const
    const panelOrder = ['tree', 'contributors', 'health', 'security', 'blast'] as const

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT')

      if (event.key === '/' && !isEditable) {
        event.preventDefault()
        document.getElementById('graph-search-input')?.focus()
        return
      }

      if (event.key === 'Escape') {
        clearSelection()
        setIsShortcutModalOpen(false)
        return
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        void exportGraphPNG(analysisResult?.repo?.name)
        return
      }

      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (analysisResult) {
          exportJSON(analysisResult, analysisResult.repo.name)
          setToastMessage('Analysis JSON downloaded')
        }
        return
      }

      if (event.key === '?') {
        event.preventDefault()
        setIsShortcutModalOpen(true)
        return
      }

      if (isEditable) {
        return
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('codelens:fit-graph'))
        return
      }

      if (event.key.toLowerCase() === 'd') {
        event.preventDefault()
        toggleTheme()
        return
      }

      if (event.key.toLowerCase() === 't') {
        event.preventDefault()
        const currentIndex = layoutOrder.indexOf(graphLayout)
        setGraphLayout(layoutOrder[(currentIndex + 1) % layoutOrder.length])
        return
      }

      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault()
        setSidebarPanel(panelOrder[Number(event.key) - 1])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    analysisResult,
    clearSelection,
    graphLayout,
    setGraphLayout,
    setSidebarPanel,
    toggleTheme,
  ])

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

  const fileTreeNodes = useMemo<CodeLensFileNode[]>(() => {
    if (!analysisResult) {
      return PLACEHOLDER_FILES
    }

    const root = new Map<string, CodeLensFileNode>()

    const ensureDirectory = (path: string): CodeLensFileNode | null => {
      if (!path) {
        return null
      }

      const existing = root.get(path)
      if (existing) {
        return existing
      }

      const segments = path.split('/')
      const name = segments[segments.length - 1] || path
      const parentPath = segments.slice(0, -1).join('/')
      const directory: CodeLensFileNode = {
        id: `dir:${path}`,
        name,
        path,
        type: 'directory',
        children: [],
      }
      root.set(path, directory)
      const parent = ensureDirectory(parentPath)
      if (parent) {
        parent.children = parent.children ?? []
        parent.children.push(directory)
      }
      return directory
    }

    const topLevel: CodeLensFileNode[] = []
    for (const file of analysisResult.files) {
      const segments = file.path.split('/')
      const parentPath = segments.slice(0, -1).join('/')
      const entry: CodeLensFileNode = {
        id: file.id,
        name: file.name,
        path: file.path,
        type: 'file',
        extension: file.extension,
        size: file.size,
      }
      const parent = ensureDirectory(parentPath)
      if (parent) {
        parent.children = parent.children ?? []
        parent.children.push(entry)
      } else {
        topLevel.push(entry)
      }
    }

    for (const directory of root.values()) {
      if (!directory.path.includes('/')) {
        topLevel.push(directory)
      }
    }

    return topLevel
  }, [analysisResult])

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setToastMessage('Share link copied to clipboard')
    } catch {
      setToastMessage('Clipboard unavailable for share link')
    }
  }

  const showPanel = (panel: typeof sidebarPanel) => sidebarPanel === panel

  return (
    <div className="app-shell">
      <Navbar
        appName="CodeLens"
        sourceLabel="Browser-based code intelligence"
        onToggleTheme={toggleTheme}
        onShare={handleShare}
      />

      <main className="app-main">
        <Sidebar title="Repository Input">
          <TokenInput
            id="github-token"
            label="GitHub Token"
            value={token}
            placeholder="ghp_..."
            onChange={setToken}
          />

          <Button
            variant="secondary"
            onClick={() => setIsOverlayVisible((current) => !current)}
          >
            Toggle Progress Overlay
          </Button>

          {showPanel('tree') ? (
            <FileTreePanel files={fileTreeNodes} />
          ) : (
            <p className="panel-body">
              Panel {sidebarPanel} is active. Press `1` to return to the file tree.
            </p>
          )}
        </Sidebar>

        <section className="workspace-column">
          {graph.nodes.length === 0 ? (
            <EmptyState
              title="No Graph Yet"
              description="Connect a repository to render dependencies and impact paths."
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
          {showPanel('contributors') ? (
            <ContributorsPanel
              selectedNode={selectedNode}
              contributorsByFile={contributorsByFile}
              fallbackContributors={PLACEHOLDER_CONTRIBUTORS}
            />
          ) : null}
          {showPanel('health') ? (
            <HealthPanel
              score={resolvedHealth}
              busFactor={busFactor}
              techStack={analysisResult?.techStack ?? null}
              analyzedAt={analysisResult?.analyzedAt ?? null}
              onReanalyze={runAnalysis}
              isReanalyzing={mode === 'loading'}
            />
          ) : null}
          {showPanel('security') ? (
            <SecurityPanel findings={resolvedSecurityFindings} />
          ) : null}
          {showPanel('blast') ? (
            <BlastRadiusPanel
              result={blastRadiusResult}
              nodes={graphForBlast.nodes}
              onSelectNode={selectNode}
            />
          ) : null}
        </Sidebar>
      </main>

      <ProgressOverlay
        isVisible={isOverlayVisible}
        message="Running placeholder analysis pipeline..."
        progress={40}
      />

      {toastMessage ? <div className="app-toast">{toastMessage}</div> : null}

      {isShortcutModalOpen ? (
        <div className="shortcut-modal-backdrop" onClick={() => setIsShortcutModalOpen(false)}>
          <div
            className="shortcut-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="panel-title">Keyboard Shortcuts</h2>
            <div className="shortcut-grid">
              <span>/</span>
              <span>Focus graph search</span>
              <span>Escape</span>
              <span>Clear selection</span>
              <span>f</span>
              <span>Fit graph to screen</span>
              <span>d</span>
              <span>Toggle theme</span>
              <span>t</span>
              <span>Cycle layout</span>
              <span>1 2 3 4 5</span>
              <span>Switch sidebar panel</span>
              <span>Ctrl+E</span>
              <span>Export graph PNG</span>
              <span>Ctrl+S</span>
              <span>Export analysis JSON</span>
              <span>?</span>
              <span>Open this modal</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
