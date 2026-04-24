import { useMemo, useState } from 'react'
import { exportBlastReport as downloadBlastReport } from '@/utils/exportUtils'
import type { BlastPathEntry, BlastRadiusResult, GraphNode } from '@/types'

export interface BlastRadiusPanelProps {
  result: BlastRadiusResult | null
  nodes: GraphNode[]
  onSelectNode?: (nodeId: string) => void
}

type BlastTab = 'dependents' | 'dependencies'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getNodePath(node: GraphNode): string {
  return node.path || node.filePath || node.id
}

function getNodeFilename(node: GraphNode): string {
  const path = getNodePath(node)
  const segments = path.split('/')
  return segments[segments.length - 1] || node.name || node.id
}

function scoreColor(score: number): string {
  if (score > 60) {
    return '#E24B4A'
  }
  if (score >= 30) {
    return '#EF9F27'
  }
  return '#1FA46E'
}

function distanceBadgeClass(distance: number): string {
  const depth = Math.max(1, Math.min(4, Math.floor(distance)))
  return `blast-distance-badge blast-distance-${depth}`
}

export function BlastRadiusPanel({
  result,
  nodes,
  onSelectNode,
}: BlastRadiusPanelProps) {
  const [activeTab, setActiveTab] = useState<BlastTab>('dependents')

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  const selectedNode = result ? nodeById.get(result.seedNodeId) ?? null : null
  const gaugeScore = clamp(result?.score ?? 0, 0, 100)
  const gaugeColor = scoreColor(gaugeScore)
  const gaugeRadius = 42
  const gaugeCircumference = 2 * Math.PI * gaugeRadius
  const gaugeOffset = gaugeCircumference * (1 - gaugeScore / 100)

  const entries: BlastPathEntry[] =
    !result
      ? []
      : activeTab === 'dependents'
        ? result.dependents
        : result.dependencies

  const exportBlastReport = () => {
    if (!result) {
      return
    }

    const rows = entries.map((entry) => {
      const node = nodeById.get(entry.nodeId)
      return {
        filePath: node ? getNodePath(node) : entry.nodeId,
        distance: entry.distance,
        contribution: Math.max(0, result.score / Math.max(1, entry.distance + 1)),
      }
    })

    downloadBlastReport(
      selectedNode ? getNodeFilename(selectedNode) : result.seedNodeId,
      rows,
    )
  }

  return (
    <section className="panel" aria-label="Blast radius panel">
      <h2 className="panel-title">Blast Radius</h2>
      {result ? (
        <>
          <div className="blast-header">
            <div className="blast-file-meta">
              <p className="blast-file-name">
                {selectedNode ? getNodeFilename(selectedNode) : result.seedNodeId}
              </p>
              <div className="blast-file-row">
                <span className="blast-language-badge">
                  {(selectedNode?.language || selectedNode?.extension || 'unknown').toUpperCase()}
                </span>
                <span className="blast-file-path">
                  {selectedNode ? getNodePath(selectedNode) : result.seedNodeId}
                </span>
              </div>
            </div>

            <svg className="blast-gauge" viewBox="0 0 110 110" aria-label="Blast score gauge">
              <circle
                cx="55"
                cy="55"
                r={gaugeRadius}
                className="blast-gauge-track"
                strokeWidth="10"
                fill="none"
              />
              <circle
                cx="55"
                cy="55"
                r={gaugeRadius}
                className="blast-gauge-value"
                stroke={gaugeColor}
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                style={{
                  strokeDasharray: gaugeCircumference,
                  strokeDashoffset: gaugeOffset,
                }}
                transform="rotate(-90 55 55)"
              />
              <text x="55" y="52" textAnchor="middle" className="blast-gauge-score">
                {gaugeScore}
              </text>
              <text x="55" y="68" textAnchor="middle" className="blast-gauge-label">
                / 100
              </text>
            </svg>
          </div>

          {result.score > 60 ? (
            <div className="blast-warning" role="alert">
              High coupling — consider splitting this module
            </div>
          ) : null}

          <div className="blast-tabs" role="tablist" aria-label="Blast impact tabs">
            <button
              type="button"
              className={activeTab === 'dependents' ? 'is-active' : ''}
              onClick={() => setActiveTab('dependents')}
            >
              Dependents (who breaks)
            </button>
            <button
              type="button"
              className={activeTab === 'dependencies' ? 'is-active' : ''}
              onClick={() => setActiveTab('dependencies')}
            >
              Dependencies (what you need)
            </button>
          </div>

          {entries.length > 0 ? (
            <ul className="list-reset panel-body blast-impact-list">
              {entries.map((entry) => {
                const node = nodeById.get(entry.nodeId)
                const label = node ? getNodeFilename(node) : entry.nodeId
                const path = node ? getNodePath(node) : entry.nodeId

                return (
                  <li key={`${activeTab}:${entry.nodeId}:${entry.distance}`}>
                    <button
                      type="button"
                      className="blast-impact-item"
                      onClick={() => onSelectNode?.(entry.nodeId)}
                    >
                      <span className={distanceBadgeClass(entry.distance)}>
                        D{entry.distance}
                      </span>
                      <span className="blast-impact-text">
                        <strong>{label}</strong>
                        <span>{path}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="panel-body">No files in this impact branch.</p>
          )}

          <button type="button" className="btn btn-secondary" onClick={exportBlastReport}>
            Export blast report
          </button>
        </>
      ) : (
        <p className="panel-body">Select a file in the graph to calculate blast radius.</p>
      )}
    </section>
  )
}
