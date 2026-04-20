import { Badge } from '@/components/ui/Badge'
import type { HealthScore } from '@/types'

export interface HealthPanelProps {
  score: HealthScore | null
}

export function HealthPanel({ score }: HealthPanelProps) {
  return (
    <section className="panel" aria-label="Health panel">
      <h2 className="panel-title">Health</h2>
      {score ? (
        <ul className="list-reset panel-body">
          <li>Maintainability: {score.maintainability}</li>
          <li>Test Coverage: {score.testCoverage}</li>
          <li>Dependency Freshness: {score.dependencyFreshness}</li>
          <li>
            Overall: <Badge label={String(score.overall)} tone="success" />
          </li>
        </ul>
      ) : (
        <p className="panel-body">No health score generated yet.</p>
      )}
    </section>
  )
}
