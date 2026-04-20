export interface MiniMapProps {
  nodesCount: number
  edgesCount: number
}

export function MiniMap({ nodesCount, edgesCount }: MiniMapProps) {
  return (
    <section className="mini-map" aria-label="Graph minimap">
      <h2 className="panel-title">MiniMap</h2>
      <p className="panel-body">
        Overview: {nodesCount} nodes / {edgesCount} edges
      </p>
    </section>
  )
}
