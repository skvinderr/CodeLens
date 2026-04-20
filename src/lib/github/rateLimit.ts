import type { RateLimitState } from '@/types'

export interface RateLimitHeaders {
  'x-ratelimit-limit'?: string
  'x-ratelimit-remaining'?: string
  'x-ratelimit-reset'?: string
}

export function parseRateLimit(headers: RateLimitHeaders): RateLimitState {
  return {
    limit: Number(headers['x-ratelimit-limit'] ?? 0),
    remaining: Number(headers['x-ratelimit-remaining'] ?? 0),
    resetAt: Number(headers['x-ratelimit-reset'] ?? 0),
  }
}
