import type { HealthScore } from '@/types'

export interface HealthInput {
  complexityAverage: number
  vulnerabilityCount: number
  staleDependencies: number
  testCoverage: number
}

export function calculateHealthScore(input: HealthInput): HealthScore {
  void input
  return {
    overall: 0,
    categories: {
      dependencies: 0,
      security: 0,
      complexity: 0,
      documentation: 0,
      testCoverage: 0,
      codeSmells: 0,
    },
    breakdown: [],
  }
}
