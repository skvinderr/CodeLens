import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { getSeverityStats } from '@/lib/analysis/securityScanner'
import { useAppStore } from '@/store/useAppStore'
import { downloadTextFile, exportSecurityMarkdown } from '@/utils/exportUtils'
import type { AlertType, SecurityAlert, SecurityFinding } from '@/types'

export interface SecurityPanelProps {
  findings: SecurityFinding[]
}

type SeverityFilter = 'all' | SecurityAlert['severity']

const ALERT_TYPES: AlertType[] = [
  'aws-access-key',
  'google-api-key',
  'github-token',
  'api-key',
  'private-key',
  'password',
  'jwt',
  'webhook-url',
  'connection-string',
  'hardcoded-ip',
  'todo-security',
  'eval-usage',
  'innerhtml-assignment',
  'dangerous-html',
  'console-log',
  'debugger',
  'insecure-http',
]

const SEVERITY_ORDER: Array<SecurityAlert['severity']> = [
  'critical',
  'high',
  'medium',
  'low',
]

const VIRTUALIZATION_THRESHOLD = 50
const ESTIMATED_CARD_HEIGHT = 210

function severityBadgeClass(severity: SecurityAlert['severity']): string {
  return `security-severity-badge security-${severity}`
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function fileNameOnly(path: string): string {
  const normalized = normalizePath(path)
  const segments = normalized.split('/')
  return segments[segments.length - 1] || normalized
}

function capitalize(value: string): string {
  if (!value) {
    return value
  }

  return `${value[0].toUpperCase()}${value.slice(1)}`
}

function formatAlertType(type: AlertType): string {
  return type
    .split('-')
    .map((part) => capitalize(part))
    .join(' ')
}

function toSarifLevel(severity: SecurityAlert['severity']): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') {
    return 'error'
  }
  if (severity === 'medium') {
    return 'warning'
  }

  return 'note'
}

function buildSarif(alerts: SecurityAlert[]): string {
  const uniqueRules = new Map<AlertType, { id: AlertType; name: string; shortDescription: string }>()

  for (const alert of alerts) {
    if (!uniqueRules.has(alert.type)) {
      uniqueRules.set(alert.type, {
        id: alert.type,
        name: formatAlertType(alert.type),
        shortDescription: alert.description,
      })
    }
  }

  const payload = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeLens Security Scanner',
            version: '1.0.0',
            informationUri: 'https://github.com/skvinderr/CodeLens',
            rules: [...uniqueRules.values()].map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: { text: rule.shortDescription },
            })),
          },
        },
        results: alerts.map((alert) => ({
          ruleId: alert.type,
          level: toSarifLevel(alert.severity),
          message: {
            text: `${alert.description} ${alert.recommendation}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: alert.filePath,
                },
                region: {
                  startLine: alert.line,
                  startColumn: alert.column,
                },
              },
            },
          ],
          partialFingerprints: {
            primaryLocationLineHash: `${alert.filePath}:${alert.line}:${alert.type}`,
          },
        })),
      },
    ],
  }

  return JSON.stringify(payload, null, 2)
}

interface AlertCardProps {
  alert: SecurityAlert
  expanded: boolean
  onToggleExpanded: (alertId: string) => void
  onJumpToFile: (filePath: string) => void
}

function AlertCard({ alert, expanded, onToggleExpanded, onJumpToFile }: AlertCardProps) {
  return (
    <article className="security-alert-card" aria-label={`${alert.severity} alert`}>
      <header className="security-alert-header">
        <span className={severityBadgeClass(alert.severity)}>
          {alert.severity.toUpperCase()}
        </span>
        <span className="security-alert-type">{formatAlertType(alert.type)}</span>
      </header>

      <div className="security-alert-meta">
        <button
          type="button"
          className="security-file-link"
          onClick={() => onJumpToFile(alert.filePath)}
        >
          {alert.filePath}
        </button>
        <span className="security-line-badge">
          L{alert.line}:C{alert.column}
        </span>
      </div>

      <p className="security-alert-description">{alert.description}</p>

      <button
        type="button"
        className="security-snippet-toggle"
        onClick={() => onToggleExpanded(alert.id)}
      >
        {expanded ? 'Collapse snippet' : 'Expand snippet'}
      </button>

      {expanded ? (
        <pre className="security-snippet" aria-label="Security finding snippet">
          <code>{alert.snippet}</code>
        </pre>
      ) : null}

      <p className="security-recommendation">{alert.recommendation}</p>
    </article>
  )
}

function SecurityPanelComponent({ findings }: SecurityPanelProps) {
  const analysisResult = useAppStore((state) => state.analysisResult)
  const selectNode = useAppStore((state) => state.selectNode)

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [fileFilter, setFileFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | AlertType>('all')
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(520)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const listRef = useRef<HTMLDivElement | null>(null)

  const alerts = useMemo<SecurityAlert[]>(() => {
    if (findings.length > 0) {
      return findings
    }

    return analysisResult?.security ?? []
  }, [analysisResult?.security, findings])

  const filteredAlerts = useMemo(() => {
    const normalizedFileFilter = fileFilter.trim().toLowerCase()

    return alerts.filter((alert) => {
      if (severityFilter !== 'all' && alert.severity !== severityFilter) {
        return false
      }

      if (typeFilter !== 'all' && alert.type !== typeFilter) {
        return false
      }

      if (!normalizedFileFilter) {
        return true
      }

      const normalizedFilePath = normalizePath(alert.filePath).toLowerCase()
      const name = fileNameOnly(alert.filePath).toLowerCase()
      return (
        normalizedFilePath.includes(normalizedFileFilter) ||
        name.includes(normalizedFileFilter)
      )
    })
  }, [alerts, fileFilter, severityFilter, typeFilter])

  const stats = useMemo(() => getSeverityStats(alerts), [alerts])

  const shouldVirtualize = filteredAlerts.length > VIRTUALIZATION_THRESHOLD

  useEffect(() => {
    if (!shouldVirtualize || !listRef.current) {
      return
    }

    const element = listRef.current
    const observer = new ResizeObserver((entries) => {
      const first = entries[0]
      if (!first) {
        return
      }

      setViewportHeight(Math.max(280, Math.floor(first.contentRect.height)))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [shouldVirtualize])

  useEffect(() => {
    setExpandedAlertIds(new Set())
  }, [fileFilter, severityFilter, typeFilter])

  const visibleWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        start: 0,
        end: filteredAlerts.length,
        topPadding: 0,
        bottomPadding: 0,
      }
    }

    const overscan = 6
    const start = Math.max(
      0,
      Math.floor(scrollTop / ESTIMATED_CARD_HEIGHT) - overscan,
    )
    const end = Math.min(
      filteredAlerts.length,
      Math.ceil((scrollTop + viewportHeight) / ESTIMATED_CARD_HEIGHT) + overscan,
    )

    return {
      start,
      end,
      topPadding: start * ESTIMATED_CARD_HEIGHT,
      bottomPadding: (filteredAlerts.length - end) * ESTIMATED_CARD_HEIGHT,
    }
  }, [filteredAlerts.length, scrollTop, shouldVirtualize, viewportHeight])

  const alertsToRender = shouldVirtualize
    ? filteredAlerts.slice(visibleWindow.start, visibleWindow.end)
    : filteredAlerts

  const toggleAlertExpanded = (alertId: string) => {
    setExpandedAlertIds((current) => {
      const next = new Set(current)
      if (next.has(alertId)) {
        next.delete(alertId)
      } else {
        next.add(alertId)
      }
      return next
    })
  }

  const handleJumpToFile = (filePath: string) => {
    selectNode(filePath)
  }

  const exportMarkdown = () => {
    exportSecurityMarkdown(alerts)
  }

  const exportJson = () => {
    downloadTextFile({
      fileName: 'security-alerts.json',
      data: JSON.stringify(alerts, null, 2),
      mimeType: 'application/json',
    })
  }

  const copySarif = async () => {
    const sarif = buildSarif(alerts)

    try {
      await navigator.clipboard.writeText(sarif)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
      downloadTextFile({
        fileName: 'security-results.sarif',
        data: sarif,
        mimeType: 'application/sarif+json',
      })
    }
  }

  if (!analysisResult) {
    return (
      <section className="panel security-panel" aria-label="Security panel">
        <h2 className="panel-title">Security</h2>
        <div className="security-empty-state" role="status">
          <span className="security-empty-icon" aria-hidden="true">
            🔒
          </span>
          <p>Analyze a repo to run security scan</p>
        </div>
      </section>
    )
  }

  return (
    <section className="panel security-panel" aria-label="Security panel">
      <h2 className="panel-title">Security</h2>

      {alerts.length === 0 ? (
        <p className="panel-body">No findings yet.</p>
      ) : (
        <>
          <div className="security-summary-grid" aria-label="Security severity summary">
            <article className="security-stat-card security-stat-critical">
              <span>Critical</span>
              <strong>{stats.critical}</strong>
            </article>
            <article className="security-stat-card security-stat-high">
              <span>High</span>
              <strong>{stats.high}</strong>
            </article>
            <article className="security-stat-card security-stat-medium">
              <span>Medium</span>
              <strong>{stats.medium}</strong>
            </article>
            <article className="security-stat-card security-stat-low">
              <span>Low</span>
              <strong>{stats.low}</strong>
            </article>
          </div>

          {stats.critical > 0 ? (
            <div className="security-banner security-banner-critical" role="alert">
              {stats.critical} critical secrets detected — rotate these immediately
            </div>
          ) : (
            <div className="security-banner security-banner-safe" role="status">
              No critical issues found
            </div>
          )}

          <div className="security-filter-bar" aria-label="Security filters">
            <div className="security-pill-row" role="tablist" aria-label="Severity filter">
              {(['all', ...SEVERITY_ORDER] as SeverityFilter[]).map((severity) => (
                <button
                  key={severity}
                  type="button"
                  className={`security-pill ${severityFilter === severity ? 'is-active' : ''}`}
                  onClick={() => setSeverityFilter(severity)}
                >
                  {severity === 'all' ? 'All' : capitalize(severity)}
                </button>
              ))}
            </div>

            <input
              type="text"
              className="security-file-filter"
              placeholder="Filter by filename"
              value={fileFilter}
              onChange={(event) => setFileFilter(event.target.value)}
            />

            <select
              className="security-type-filter"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as 'all' | AlertType)
              }
            >
              <option value="all">All types</option>
              {ALERT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatAlertType(type)}
                </option>
              ))}
            </select>
          </div>

          <div
            ref={listRef}
            className="security-alert-scroll"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            {filteredAlerts.length === 0 ? (
              <p className="panel-body">No alerts match the current filters.</p>
            ) : (
              <div className="security-alert-list">
                {shouldVirtualize ? (
                  <div style={{ height: `${visibleWindow.topPadding}px` }} aria-hidden="true" />
                ) : null}

                {alertsToRender.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    expanded={expandedAlertIds.has(alert.id)}
                    onToggleExpanded={toggleAlertExpanded}
                    onJumpToFile={handleJumpToFile}
                  />
                ))}

                {shouldVirtualize ? (
                  <div
                    style={{ height: `${visibleWindow.bottomPadding}px` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            )}
          </div>

          <footer className="security-actions" aria-label="Security exports">
            <button type="button" className="btn btn-secondary" onClick={exportMarkdown}>
              Export as Markdown
            </button>
            <button type="button" className="btn btn-secondary" onClick={exportJson}>
              Export as JSON
            </button>
            <button type="button" className="btn btn-secondary" onClick={copySarif}>
              Copy SARIF
            </button>
            {copyStatus === 'copied' ? (
              <span className="security-copy-status">SARIF copied to clipboard.</span>
            ) : null}
            {copyStatus === 'failed' ? (
              <span className="security-copy-status is-failed">
                Clipboard unavailable. Downloaded SARIF file instead.
              </span>
            ) : null}
          </footer>
        </>
      )}
    </section>
  )
}

export const SecurityPanel = memo(SecurityPanelComponent)
