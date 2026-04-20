import { Badge } from '@/components/ui/Badge'
import type { Contributor } from '@/types'

export interface ContributorsPanelProps {
  contributors: Contributor[]
}

export function ContributorsPanel({ contributors }: ContributorsPanelProps) {
  return (
    <section className="panel" aria-label="Contributors panel">
      <h2 className="panel-title">Contributors</h2>
      <ul className="list-reset panel-body">
        {contributors.map((contributor) => (
          <li key={contributor.id}>
            {contributor.name} <Badge label={`${contributor.commits} commits`} />
          </li>
        ))}
      </ul>
    </section>
  )
}
