import { useEffect, useMemo, useState } from 'react'
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
import { useAppStore } from '@/store/useAppStore'
import type { BlastRadiusResult, CodeLensFileNode, Contributor } from '@/types'

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

const PLACEHOLDER_BLAST_RADIUS: BlastRadiusResult = {
  seedNodeId: 'node-1',
  impactedNodeIds: [],
  impactedEdgeIds: [],
  score: 0,
}

function App() {
  const [isOverlayVisible, setIsOverlayVisible] = useState(false)

  const mode = useAppStore((state) => state.mode)
  const error = useAppStore((state) => state.error)
  const selectNode = useAppStore((state) => state.selectNode)
  const theme = useAppStore((state) => state.theme)
  const toggleTheme = useAppStore((state) => state.toggleTheme)

  const { graph } = useGraph()
  const { token, setToken } = useGitHub()
  const { status: analysisStatus, findings, health } = useAnalysis()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

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

  return (
    <div className="app-shell">
      <Navbar
        appName="CodeLens"
        sourceLabel="Browser-based code intelligence"
        onToggleTheme={toggleTheme}
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

          <FileTreePanel files={PLACEHOLDER_FILES} />
        </Sidebar>

        <section className="workspace-column">
          {graph.nodes.length === 0 ? (
            <EmptyState
              title="No Graph Yet"
              description="Connect a repository to render dependencies and impact paths."
            />
          ) : (
            <GraphCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeSelect={selectNode}
            />
          )}

          <StatusBar
            message={`${statusMessage} | ${analysisStatus.message}`}
            kind={mode}
          />
        </section>

        <Sidebar title="Insights">
          <ContributorsPanel contributors={PLACEHOLDER_CONTRIBUTORS} />
          <HealthPanel score={health} />
          <SecurityPanel findings={findings} />
          <BlastRadiusPanel result={PLACEHOLDER_BLAST_RADIUS} />
        </Sidebar>
      </main>

      <ProgressOverlay
        isVisible={isOverlayVisible}
        message="Running placeholder analysis pipeline..."
        progress={40}
      />
    </div>
  )
}

export default App
