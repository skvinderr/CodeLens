import { useMemo, useSyncExternalStore } from 'react'
import type { Octokit } from '@octokit/rest'
import type { RateLimitState } from '@/types'

export interface RateLimitHeaders {
  'X-RateLimit-Limit'?: string | number
  'X-RateLimit-Remaining'?: string | number
  'X-RateLimit-Reset'?: string | number
  'x-ratelimit-limit'?: string
  'x-ratelimit-remaining'?: string
  'x-ratelimit-reset'?: string
}

let rateLimitStatus: RateLimitState = {
  remaining: 0,
  limit: 0,
  resetAt: 0,
}

const listeners = new Set<() => void>()
const trackedClients = new WeakSet<Octokit>()

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function notifySubscribers(): void {
  for (const listener of listeners) {
    listener()
  }
}

function isSameRateLimitState(
  left: RateLimitState,
  right: RateLimitState,
): boolean {
  return (
    left.remaining === right.remaining &&
    left.limit === right.limit &&
    left.resetAt === right.resetAt
  )
}

export function parseRateLimit(headers: RateLimitHeaders): RateLimitState {
  return {
    limit: toNumber(headers['x-ratelimit-limit'] ?? headers['X-RateLimit-Limit']),
    remaining: toNumber(
      headers['x-ratelimit-remaining'] ?? headers['X-RateLimit-Remaining'],
    ),
    resetAt: toNumber(headers['x-ratelimit-reset'] ?? headers['X-RateLimit-Reset']),
  }
}

function applyRateLimitHeaders(headers: RateLimitHeaders): void {
  const parsed = parseRateLimit(headers)
  const next: RateLimitState = {
    remaining: parsed.remaining,
    limit: parsed.limit,
    resetAt: parsed.resetAt,
  }

  if (isSameRateLimitState(rateLimitStatus, next)) {
    return
  }

  rateLimitStatus = next
  notifySubscribers()
}

export function registerRateLimitHooks(octokit: Octokit): void {
  if (trackedClients.has(octokit)) {
    return
  }

  trackedClients.add(octokit)

  octokit.hook.after('request', async (response) => {
    applyRateLimitHeaders(response.headers as RateLimitHeaders)
  })

  octokit.hook.error('request', async (error) => {
    const maybeHeaders =
      typeof error === 'object' && error !== null && 'response' in error
        ? (
            (error as { response?: { headers?: RateLimitHeaders } }).response
              ?.headers ?? null
          )
        : null

    if (maybeHeaders) {
      applyRateLimitHeaders(maybeHeaders)
    }

    throw error
  })
}

export function getRateLimitStatus(): RateLimitState {
  return rateLimitStatus
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRateLimit(): { status: RateLimitState; warning: string } {
  const status = useSyncExternalStore(subscribe, getRateLimitStatus, getRateLimitStatus)

  const warning = useMemo(() => {
    if (status.limit === 0) {
      return ''
    }

    if (status.remaining <= 0) {
      return 'GitHub API rate limit exhausted. Wait until reset before retrying.'
    }

    const threshold = Math.max(1, Math.ceil(status.limit * 0.1))
    if (status.remaining <= threshold) {
      return `GitHub API rate limit is low (${status.remaining}/${status.limit} remaining).`
    }

    return ''
  }, [status.limit, status.remaining])

  return { status, warning }
}
