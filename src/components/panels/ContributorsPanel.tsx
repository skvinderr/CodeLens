import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import {
  contributorColorFromLogin,
  contributorInitials,
  formatCommitDate,
  normalizePathKey,
} from '@/utils/ownershipUtils'
import type { Contributor, FileContributors, GraphNode } from '@/types'

export interface ContributorsPanelProps {
  selectedNode: GraphNode | null
  contributorsByFile: Map<string, FileContributors> | null
  fallbackContributors?: Contributor[]
}

interface OwnerAvatarProps {
  login: string
  avatarUrl?: string
}

function OwnerAvatar({ login, avatarUrl }: OwnerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(avatarUrl) && !imageFailed

  if (showImage) {
    return (
      <img
        className="owner-avatar"
        src={avatarUrl}
        alt={`@${login}`}
        onError={() => setImageFailed(true)}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <span
      className="owner-avatar owner-avatar-fallback"
      style={{ backgroundColor: contributorColorFromLogin(login) }}
      aria-hidden="true"
    >
      {contributorInitials(login)}
    </span>
  )
}

function normalizeContributorsMap(
  source: Map<string, FileContributors> | null,
): Map<string, FileContributors> {
  const map = new Map<string, FileContributors>()
  if (!source) {
    return map
  }

  for (const [key, value] of source.entries()) {
    map.set(normalizePathKey(key), value)
    map.set(normalizePathKey(value.filePath), value)
  }

  return map
}

function sortedByCommits(contributors: Contributor[]): Contributor[] {
  return [...contributors].sort((left, right) => {
    if (right.commits !== left.commits) {
      return right.commits - left.commits
    }
    return left.login.localeCompare(right.login)
  })
}

function getNodePath(node: GraphNode): string {
  return node.path || node.filePath || node.id
}

function getNodeFilename(node: GraphNode): string {
  const path = getNodePath(node)
  const segments = path.split('/')
  return segments[segments.length - 1] || node.name || node.id
}

export function ContributorsPanel({
  selectedNode,
  contributorsByFile,
  fallbackContributors = [],
}: ContributorsPanelProps) {
  const normalizedMap = useMemo(
    () => normalizeContributorsMap(contributorsByFile),
    [contributorsByFile],
  )

  const selectedPath = selectedNode ? normalizePathKey(getNodePath(selectedNode)) : null

  const contributors = useMemo(() => {
    if (!selectedNode || !selectedPath) {
      return []
    }

    const fromMap =
      normalizedMap.get(selectedPath)?.contributors ??
      normalizedMap.get(normalizePathKey(selectedNode.id))?.contributors

    if (fromMap && fromMap.length > 0) {
      return sortedByCommits(fromMap)
    }

    return sortedByCommits(fallbackContributors)
  }, [fallbackContributors, normalizedMap, selectedNode, selectedPath])

  const topOwners = contributors.slice(0, 3)
  const primaryOwner = topOwners[0]?.login ?? null
  const totalCommits = contributors.reduce((sum, contributor) => sum + contributor.commits, 0)

  const ownershipSegments = contributors.map((contributor) => ({
    login: contributor.login,
    commits: contributor.commits,
    share: totalCommits > 0 ? contributor.commits / totalCommits : 0,
    color: contributorColorFromLogin(contributor.login),
  }))

  const openOwnerProfile = () => {
    if (!primaryOwner) {
      return
    }

    window.open(`https://github.com/${primaryOwner}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="panel" aria-label="Contributors panel">
      <h2 className="panel-title">Contributors</h2>

      {!selectedNode ? (
        <p className="panel-body">Select a file node to inspect file owners.</p>
      ) : (
        <>
          <div className="contributors-selected-header">
            <h3 className="contributors-section-title">File owners</h3>
            <p className="contributors-selected-file">{getNodeFilename(selectedNode)}</p>
          </div>

          {contributors.length === 0 ? (
            <p className="panel-body">No contributor history available for this file.</p>
          ) : (
            <>
              <ul className="list-reset contributors-owner-list">
                {topOwners.map((contributor) => (
                  <li key={contributor.login} className="contributors-owner-item">
                    <OwnerAvatar
                      login={contributor.login}
                      avatarUrl={contributor.avatarUrl}
                    />
                    <div className="contributors-owner-meta">
                      <div className="contributors-owner-name-row">
                        <span className="contributors-owner-name">@{contributor.login}</span>
                        <Badge label={`${contributor.commits} commits`} />
                      </div>
                      <span className="contributors-owner-date">
                        Last commit {formatCommitDate(contributor.lastCommit)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={openOwnerProfile}
                disabled={!primaryOwner}
              >
                Ask on GitHub
              </button>

              <div className="contributors-ownership-bar" aria-label="Ownership distribution">
                {ownershipSegments.map((segment) => (
                  <span
                    key={segment.login}
                    className="contributors-ownership-segment"
                    style={{
                      width: `${Math.max(segment.share * 100, 4)}%`,
                      backgroundColor: segment.color,
                    }}
                    title={`@${segment.login}: ${Math.round(segment.share * 100)}%`}
                  />
                ))}
              </div>

              <details className="contributors-all-list">
                <summary>All contributors</summary>
                <ul className="list-reset panel-body">
                  {contributors.map((contributor) => {
                    const share = totalCommits > 0 ? (contributor.commits / totalCommits) * 100 : 0
                    return (
                      <li key={`all:${contributor.login}`} className="contributors-all-item">
                        <span
                          className="contributors-color-dot"
                          style={{ backgroundColor: contributorColorFromLogin(contributor.login) }}
                          aria-hidden="true"
                        />
                        <span className="contributors-all-name">@{contributor.login}</span>
                        <span className="contributors-all-count">{contributor.commits}</span>
                        <span className="contributors-all-share">{share.toFixed(1)}%</span>
                      </li>
                    )
                  })}
                </ul>
              </details>
            </>
          )}
        </>
      )}
    </section>
  )
}
