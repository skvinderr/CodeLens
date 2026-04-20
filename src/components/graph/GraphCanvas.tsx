import { Button } from '@/components/ui/Button'
import type { GraphEdge, GraphNode } from '@/types'

export interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeSelect?: (nodeId: string) => void
}

export function GraphCanvas({ nodes, edges, onNodeSelect }: GraphCanvasProps) {
  const firstNode = nodes[0] ?? null

  return (
    <section className="graph-canvas" aria-label="Dependency graph">
      <h2 className="panel-title">Graph Canvas</h2>
      <p className="panel-body">
        Nodes: {nodes.length} | Edges: {edges.length}
      </p>

      {firstNode ? (
        <Button variant="ghost" onClick={() => onNodeSelect?.(firstNode.id)}>
          Select {firstNode.label}
        </Button>
      ) : null}
    </section>
  )
}
