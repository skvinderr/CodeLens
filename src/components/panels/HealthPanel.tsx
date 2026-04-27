import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import type {
  BusFactorAnalysis,
  HealthCategories,
  HealthFinding,
  HealthScore,
  TechStack,
} from '@/types'

export interface HealthPanelProps {
  score: HealthScore | null
  busFactor: BusFactorAnalysis | null
  techStack: TechStack | null
  analyzedAt: Date | string | null
  onReanalyze?: () => void | Promise<void>
  isReanalyzing?: boolean
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

function scoreToColor(score: number): string {
  if (score < 45) {
    return '#E24B4A'
  }
  if (score < 60) {
    return '#EF9F27'
  }
  if (score < 75) {
    return '#FAC775'
  }
  if (score < 90) {
    return '#1D9E75'
  }
  return '#639922'
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`
}

function testFrameworkFromTechStack(techStack: TechStack | null): string {
  if (!techStack) {
    return 'Unknown'
  }

  const frameworks = techStack.frameworks.map((framework) => framework.toLowerCase())

  if (frameworks.some((framework) => framework.includes('vitest'))) {
    return 'Vitest'
  }
  if (frameworks.some((framework) => framework.includes('jest'))) {
    return 'Jest'
  }
  if (frameworks.some((framework) => framework.includes('pytest'))) {
    return 'Pytest'
  }
  if (frameworks.some((framework) => framework.includes('mocha'))) {
    return 'Mocha'
  }
  if (frameworks.some((framework) => framework.includes('cypress'))) {
    return 'Cypress'
  }

  return techStack.hasTests ? 'Detected' : 'Not detected'
}

function packageManagerIcon(packageManager?: string): string {
  const key = (packageManager ?? '').toLowerCase()
  if (key.includes('npm')) {
    return '📦'
  }
  if (key.includes('yarn')) {
    return '🧶'
  }
  if (key.includes('pnpm')) {
    return '📦'
  }
  if (key.includes('pip') || key.includes('poetry')) {
    return '🐍'
  }

  return '🧩'
}

function categoryLabel(category: keyof HealthCategories | string): string {
  const key = String(category)
  if (key === 'testCoverage') {
    return 'Test Coverage'
  }
  if (key === 'codeSmells') {
    return 'Code Health'
  }

  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`
}

const CATEGORY_ROWS: Array<{ key: keyof HealthCategories; label: string }> = [
  { key: 'security', label: 'Security' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'complexity', label: 'Complexity' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'testCoverage', label: 'Test Coverage' },
  { key: 'codeSmells', label: 'Code Health' },
]

export function HealthPanel({
  score,
  busFactor,
  techStack,
  analyzedAt,
  onReanalyze,
  isReanalyzing = false,
}: HealthPanelProps) {
  const riskyFiles = busFactor
    ? busFactor.files.filter((risk) => risk.isSingleOwnerRisk).slice(0, 6)
    : []

  const [animatedScore, setAnimatedScore] = useState(0)
  const [expandedCategory, setExpandedCategory] = useState<keyof HealthCategories | null>(null)

  useEffect(() => {
    const target = score?.overall ?? 0
    let rafId = 0
    const duration = 800
    const startedAt = performance.now()

    const step = (time: number) => {
      const elapsed = time - startedAt
      const progress = Math.min(1, elapsed / duration)
      const eased = 1 - (1 - progress) ** 3
      setAnimatedScore(Math.round(target * eased))

      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      }
    }

    setAnimatedScore(0)
    rafId = requestAnimationFrame(step)

    return () => cancelAnimationFrame(rafId)
  }, [score?.overall])

  const languageStats = useMemo(() => {
    if (!techStack) {
      return []
    }

    const entries = Object.entries(techStack.languages)
    const total = entries.reduce((sum, [, value]) => sum + value, 0)

    if (entries.length === 0 || total <= 0) {
      return []
    }

    return entries
      .sort((left, right) => right[1] - left[1])
      .map(([name, value]) => ({
        name,
        percentage: Math.round((value / total) * 100),
      }))
  }, [techStack])

  const findingsByCategory = useMemo(() => {
    const map = new Map<string, HealthFinding[]>()
    if (!score) {
      return map
    }

    for (const finding of score.breakdown) {
      const key = String(finding.category)
      const existing = map.get(key)
      if (existing) {
        existing.push(finding)
      } else {
        map.set(key, [finding])
      }
    }

    return map
  }, [score])

  const gaugeScore = score?.overall ?? 0
  const gaugeColor = scoreToColor(gaugeScore)
  const gaugeRadius = 66
  const gaugeCircumference = 2 * Math.PI * gaugeRadius
  const gaugeOffset = gaugeCircumference * (1 - animatedScore / 100)

  return (
    <section className="panel health-panel" aria-label="Health panel">
      <h2 className="panel-title">Health</h2>
      {score ? (
        <>
          <section className="health-gauge-wrap" aria-label="Overall health score">
            <svg className="health-gauge" viewBox="0 0 160 160" aria-hidden="true">
              <circle
                cx="80"
                cy="80"
                r={gaugeRadius}
                className="health-gauge-track"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="80"
                cy="80"
                r={gaugeRadius}
                className="health-gauge-value"
                stroke={gaugeColor}
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
                style={{
                  strokeDasharray: gaugeCircumference,
                  strokeDashoffset: gaugeOffset,
                }}
                transform="rotate(-90 80 80)"
              />
            </svg>

            <div className="health-gauge-center">
              <p className="health-grade">{score.grade}</p>
              <p className="health-score-label">{score.overall} / 100</p>
            </div>
          </section>

          <section className="health-categories" aria-label="Category health scores">
            {CATEGORY_ROWS.map((row) => {
              const value = score.categories[row.key]
              const rowFindings = findingsByCategory.get(row.key) ?? []
              const expanded = expandedCategory === row.key

              return (
                <div key={row.key} className="health-category-row-wrap">
                  <button
                    type="button"
                    className="health-category-row"
                    onClick={() =>
                      setExpandedCategory((current) =>
                        current === row.key ? null : row.key,
                      )
                    }
                  >
                    <span className="health-category-name">{row.label}</span>
                    <span className="health-category-bar">
                      <span
                        className="health-category-fill"
                        style={{
                          width: `${value}%`,
                          backgroundColor: scoreToColor(value),
                        }}
                      />
                    </span>
                    <span className="health-category-value">{value}</span>
                  </button>

                  {expanded ? (
                    <ul className="list-reset health-category-findings">
                      {rowFindings.length > 0 ? (
                        rowFindings.map((finding, index) => (
                          <li key={`${row.key}:${index}`}>
                            <span
                              className={`health-points-chip ${
                                finding.points >= 0 ? 'is-positive' : 'is-negative'
                              }`}
                            >
                              {formatPoints(finding.points)}
                            </span>
                            <span>{finding.message}</span>
                          </li>
                        ))
                      ) : (
                        <li>No notable findings for this category.</li>
                      )}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </section>

          <section className="health-improvements" aria-label="How to improve health score">
            <h3 className="panel-title">How to improve</h3>
            {score.improvements.length > 0 ? (
              <ol className="list-reset health-improvement-list">
                {score.improvements.slice(0, 3).map((improvement, index) => (
                  <li key={`${improvement.category}:${index}`}>
                    <span className="health-improvement-index">{index + 1}</span>
                    <div className="health-improvement-card">
                      <span className="health-improvement-category">
                        {categoryLabel(improvement.category)}
                      </span>
                      <p>{improvement.message}</p>
                      <strong>Estimated gain: +{improvement.estimatedGain}</strong>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="panel-body">No immediate improvements detected.</p>
            )}
          </section>

          <section className="health-tech-stack" aria-label="Tech stack summary">
            <h3 className="panel-title">Tech stack</h3>

            <div className="health-tech-row">
              {languageStats.length > 0 ? (
                languageStats.slice(0, 6).map((language) => (
                  <span key={language.name} className="health-tech-pill">
                    {language.name} {language.percentage}%
                  </span>
                ))
              ) : (
                <span className="panel-body">No language data</span>
              )}
            </div>

            <div className="health-tech-row">
              {techStack?.frameworks?.length ? (
                techStack.frameworks.map((framework) => (
                  <span key={framework} className="health-framework-badge">
                    {framework}
                  </span>
                ))
              ) : (
                <span className="panel-body">No frameworks detected</span>
              )}
            </div>

            <div className="health-tech-meta">
              <span>
                {packageManagerIcon(techStack?.packageManager)} {techStack?.packageManager ?? 'Unknown package manager'}
              </span>
              <span>
                {techStack?.hasCI ? '✅ CI/CD configured' : '✖ CI/CD not detected'}
              </span>
              <span>Tests: {testFrameworkFromTechStack(techStack)}</span>
            </div>
          </section>
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

      <footer className="health-footer" aria-label="Health actions">
        <span className="health-last-analyzed">
          Last analyzed:{' '}
          {analyzedAt
            ? new Date(analyzedAt).toLocaleString()
            : 'Not analyzed yet'}
        </span>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onReanalyze?.()}
          disabled={isReanalyzing}
        >
          {isReanalyzing ? 'Re-analyzing...' : 'Re-analyze'}
        </button>
      </footer>
    </section>
  )
}
