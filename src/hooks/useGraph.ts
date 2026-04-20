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
  const mode = useAppStore((state) => state.mode)
  const error = useAppStore((state) => state.error)
  const visibleNodes = useAppStore((state) => state.selectVisibleNodes())
  const visibleLinks = useAppStore((state) => state.selectVisibleLinks())

  const graph = useMemo<GraphData>(
    () => ({
      nodes: visibleNodes,
      links: visibleLinks,
      edges: visibleLinks,
    }),
    [visibleLinks, visibleNodes],
  )

  return useMemo(
    () => ({
      graph,
      isLoading: mode === 'loading',
      error,
      refresh: () => undefined,
    }),
    [error, graph, mode],
  )
}
