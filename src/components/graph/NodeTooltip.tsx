import type { GraphNode } from '@/types'

export interface NodeTooltipProps {
  node: GraphNode | null
  visible: boolean
}

export function NodeTooltip({ node, visible }: NodeTooltipProps) {
  if (!visible || !node) {
    return null
  }

  const title = node.name || node.label || node.id
  const path = node.path || node.filePath || node.id

  return (
    <section className="node-tooltip" aria-label="Selected node details">
      <h2 className="panel-title">{title}</h2>
      <p className="panel-body">{path}</p>
      <p className="panel-body">Language: {node.language || 'unknown'}</p>
      <p className="panel-body">Size: {node.size} bytes</p>
    </section>
  )
}
