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
    maintainability: 0,
    testCoverage: 0,
    dependencyFreshness: 0,
    overall: 0,
  }
}
