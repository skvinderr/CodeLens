import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { GraphLink, GraphNode } from '@/types'
import type { GraphData } from '@/types'

export interface UseGraphResult {
  graph: GraphData
  isLoading: boolean
  error: string | null
  refresh: () => void
}

const EMPTY_NODES: GraphNode[] = []
const EMPTY_LINKS: GraphLink[] = []

export function useGraph(): UseGraphResult {
  const mode = useAppStore((state) => state.mode)
  const error = useAppStore((state) => state.error)
  const analysisResult = useAppStore((state) => state.analysisResult)
  const graphFilter = useAppStore((state) => state.graphFilter)

  const visibleNodes = useMemo<GraphNode[]>(() => {
    if (!analysisResult) {
      return EMPTY_NODES
    }

    return analysisResult.graph.nodes.filter((node) => {
      const languageMatch =
        graphFilter.languages.length === 0 ||
        graphFilter.languages.includes(node.language)
      const sizeMatch = node.size >= graphFilter.minSize
      const connectionMatch = node.degree <= graphFilter.maxConnections
      const orphanMatch = graphFilter.showOrphans || node.degree > 0

      return languageMatch && sizeMatch && connectionMatch && orphanMatch
    })
  }, [analysisResult, graphFilter])

  const visibleLinks = useMemo<GraphLink[]>(() => {
    if (!analysisResult || visibleNodes.length === 0) {
      return EMPTY_LINKS
    }

    const links =
      analysisResult.graph.links.length > 0
        ? analysisResult.graph.links
        : analysisResult.graph.edges

    if (links.length === 0) {
      return EMPTY_LINKS
    }

    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
    return links.filter(
      (link) =>
        visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target),
    )
  }, [analysisResult, visibleNodes])

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
