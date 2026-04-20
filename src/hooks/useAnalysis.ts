import { useMemo } from 'react'
import type { AppStatus, HealthScore, SecurityFinding } from '@/types'

export interface UseAnalysisResult {
  status: AppStatus
  findings: SecurityFinding[]
  health: HealthScore | null
  runAnalysis: () => Promise<void>
}

export function useAnalysis(): UseAnalysisResult {
  return useMemo(
    () => ({
      status: { message: 'Analysis has not started', kind: 'idle' },
      findings: [],
      health: null,
      runAnalysis: async () => undefined,
    }),
    [],
  )
}
