import type { BlastRadiusResult } from '@/types'

export interface BlastRadiusPanelProps {
  result: BlastRadiusResult | null
}

export function BlastRadiusPanel({ result }: BlastRadiusPanelProps) {
  return (
    <section className="panel" aria-label="Blast radius panel">
      <h2 className="panel-title">Blast Radius</h2>
      {result ? (
        <p className="panel-body">
          Seed: {result.seedNodeId} | Impacted: {result.impactedNodeIds.length} |
          Score: {result.score}
        </p>
      ) : (
        <p className="panel-body">Run analysis to estimate blast radius.</p>
      )}
    </section>
  )
}
