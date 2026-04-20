import { Badge } from '@/components/ui/Badge'
import type { SecurityFinding } from '@/types'

export interface SecurityPanelProps {
  findings: SecurityFinding[]
}

export function SecurityPanel({ findings }: SecurityPanelProps) {
  return (
    <section className="panel" aria-label="Security panel">
      <h2 className="panel-title">Security</h2>
      {findings.length === 0 ? (
        <p className="panel-body">No findings yet.</p>
      ) : (
        <ul className="list-reset panel-body">
          {findings.map((finding) => (
            <li key={finding.id}>
              {finding.title} <Badge label={finding.severity} tone="warning" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
