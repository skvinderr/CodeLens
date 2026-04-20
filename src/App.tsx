import { useState } from 'react'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { GraphControls } from '@/components/graph/GraphControls'
import { MiniMap } from '@/components/graph/MiniMap'
import { NodeTooltip } from '@/components/graph/NodeTooltip'
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
  { id: 'u-1', name: 'Alex Rivera', commits: 24 },
  { id: 'u-2', name: 'Jordan Lee', commits: 17 },
]

const PLACEHOLDER_BLAST_RADIUS: BlastRadiusResult = {
  seedNodeId: 'node-1',
  impactedNodeIds: [],
  impactedEdgeIds: [],
  score: 0,
}

function App() {
  const [isOverlayVisible, setIsOverlayVisible] = useState(false)

  const appStatus = useAppStore((state) => state.status)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)

  const { graph } = useGraph()
  const { token, setToken } = useGitHub()
  const { status: analysisStatus, findings, health } = useAnalysis()

  return (
    <div className="app-shell">
      <Navbar appName="CodeLens" sourceLabel="Browser-based code intelligence" />

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
          <GraphControls
            onZoomIn={() => undefined}
            onZoomOut={() => undefined}
            onReset={() => undefined}
            onFit={() => undefined}
          />

          {graph.nodes.length === 0 ? (
            <EmptyState
              title="No Graph Yet"
              description="Connect a repository to render dependencies and impact paths."
            />
          ) : (
            <GraphCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeSelect={setSelectedNodeId}
            />
          )}

          <MiniMap nodesCount={graph.nodes.length} edgesCount={graph.edges.length} />

          <NodeTooltip
            node={graph.nodes[0] ?? null}
            visible={graph.nodes.length > 0}
          />

          <StatusBar
            message={`${appStatus.message} | ${analysisStatus.message}`}
            kind={appStatus.kind}
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
