import { Button } from '@/components/ui/Button'

export interface GraphControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFit: () => void
}

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
}: GraphControlsProps) {
  return (
    <section className="graph-controls" aria-label="Graph controls">
      <Button variant="primary" onClick={onZoomIn}>
        Zoom In
      </Button>
      <Button variant="primary" onClick={onZoomOut}>
        Zoom Out
      </Button>
      <Button variant="secondary" onClick={onFit}>
        Fit View
      </Button>
      <Button variant="ghost" onClick={onReset}>
        Reset
      </Button>
    </section>
  )
}
