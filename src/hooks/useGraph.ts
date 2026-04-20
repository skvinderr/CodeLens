import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { GraphData } from '@/types'

export interface UseGraphResult {
  graph: GraphData
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useGraph(): UseGraphResult {
  const graph = useAppStore((state) => state.graph)

  const result = useMemo<UseGraphResult>(
    () => ({
      graph,
      isLoading: false,
      error: null,
      refresh: () => undefined,
    }),
    [graph],
  )

  return result
}
