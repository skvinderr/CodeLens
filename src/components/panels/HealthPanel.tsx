import { Badge } from '@/components/ui/Badge'
import type { BusFactorAnalysis, HealthScore } from '@/types'

export interface HealthPanelProps {
  score: HealthScore | null
  busFactor: BusFactorAnalysis | null
}

function busFactorTone(
  riskLevel: BusFactorAnalysis['riskLevel'] | null,
): 'success' | 'warning' | 'danger' {
  if (riskLevel === 'high') {
    return 'danger'
  }
  if (riskLevel === 'medium') {
    return 'warning'
  }
  return 'success'
}

export function HealthPanel({ score, busFactor }: HealthPanelProps) {
  const riskyFiles = busFactor
    ? busFactor.files.filter((risk) => risk.isSingleOwnerRisk).slice(0, 6)
    : []

  return (
    <section className="panel" aria-label="Health panel">
      <h2 className="panel-title">Health</h2>
      {score ? (
        <>
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
        </>
      ) : (
        <p className="panel-body">No health score generated yet.</p>
      )}

      <section className="bus-factor-card" aria-label="Bus factor risk">
        <h3 className="panel-title">Bus Factor Risk</h3>
        {busFactor ? (
          <>
            <p className="panel-body bus-factor-summary">
              Single-owner files: {busFactor.singleOwnerFiles}/{busFactor.totalFiles} ({' '}
              {busFactor.globalSingleOwnerPercent.toFixed(1)}%)
            </p>
            <Badge
              label={busFactor.riskLevel.toUpperCase()}
              tone={busFactorTone(busFactor.riskLevel)}
            />

            {riskyFiles.length > 0 ? (
              <ul className="list-reset panel-body bus-factor-risk-list">
                {riskyFiles.map((risk) => (
                  <li key={risk.filePath}>
                    <span className="bus-factor-warning-icon" aria-hidden="true">
                      ⚠
                    </span>{' '}
                    {risk.filePath} ({Math.round(risk.topShare * 100)}% @{risk.topContributor})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-body">No high-risk single-owner files detected.</p>
            )}
          </>
        ) : (
          <p className="panel-body">
            No contributor ownership data available yet for bus-factor analysis.
          </p>
        )}
      </section>
    </section>
  )
}
