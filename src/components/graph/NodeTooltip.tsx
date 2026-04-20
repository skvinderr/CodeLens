import type { GraphNode } from '@/types'

export interface NodeTooltipProps {
  node: GraphNode | null
  visible: boolean
}

export function NodeTooltip({ node, visible }: NodeTooltipProps) {
  if (!visible || !node) {
    return null
  }

  return (
    <section className="node-tooltip" aria-label="Selected node details">
      <h2 className="panel-title">{node.label}</h2>
      <p className="panel-body">{node.filePath}</p>
    </section>
  )
}
