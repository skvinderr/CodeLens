import type { Contributor } from '@/types'

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

export function contributorColorFromLogin(login: string): string {
  const normalized = login.trim().toLowerCase()
  const hue = hashString(normalized) % 360
  return `hsl(${hue} 68% 52%)`
}

export function contributorInitials(login: string): string {
  const cleaned = login.trim().replace(/[^a-z0-9]+/gi, ' ')
  if (!cleaned) {
    return '?'
  }

  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '')
}

export function contributorFromList(contributors: Contributor[]): Contributor | null {
  if (contributors.length === 0) {
    return null
  }

  return [...contributors].sort((left, right) => {
    if (right.commits !== left.commits) {
      return right.commits - left.commits
    }

    return left.login.localeCompare(right.login)
  })[0]
}

export function formatCommitDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
