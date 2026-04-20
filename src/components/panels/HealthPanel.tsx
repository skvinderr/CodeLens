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
          <li>Dependencies: {score.categories.dependencies}</li>
          <li>Security: {score.categories.security}</li>
          <li>Complexity: {score.categories.complexity}</li>
          <li>Documentation: {score.categories.documentation}</li>
          <li>Test Coverage: {score.categories.testCoverage}</li>
          <li>Code Smells: {score.categories.codeSmells}</li>
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
