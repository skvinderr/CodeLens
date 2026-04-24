import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { calculateBlastRadius } from '@/lib/graph/blastRadius'
import type { AnalysisResult, AnalysisStage, AppMode, GraphLink, GraphNode } from '@/types'

type SidebarPanel = 'tree' | 'contributors' | 'health' | 'security' | 'blast'
export type GraphLayoutMode = 'force' | 'radial' | 'hierarchical' | 'cluster'
export type GraphOverlayMode =
  | 'language'
  | 'blast'
  | 'size'
  | 'age'
  | 'tests'
  | 'ownership'

interface GraphFilter {
  languages: string[]
  minSize: number
  maxConnections: number
  showOrphans: boolean
}

interface AppStoreState {
  mode: AppMode
  repoInput: string
  githubToken: string
  analysisResult: AnalysisResult | null
  selectedNodeId: string | null
  hoveredNodeId: string | null
  blastRadiusIds: Set<string>
  highlightedLinks: Set<string>
  graphFilter: GraphFilter
  sidebarPanel: SidebarPanel
  graphLayout: GraphLayoutMode
  graphOverlay: GraphOverlayMode
  stages: AnalysisStage[]
  error: string | null
  warning: string | null
  theme: 'light' | 'dark'
}

interface AppStoreActions {
  setRepoInput: (value: string) => void
  setGithubToken: (value: string) => void
  setMode: (mode: AppMode) => void
  setError: (message: string | null) => void
  clearError: () => void
  setWarning: (message: string | null) => void
  setAnalysisResult: (result: AnalysisResult | null) => void
  selectNode: (id: string | null) => void
  clearSelection: () => void
  resetApp: () => void
  updateStage: (id: string, patch: Partial<Omit<AnalysisStage, 'id'>>) => void
  setStages: (stages: AnalysisStage[]) => void
  setGraphFilter: (partial: Partial<GraphFilter>) => void
  setSidebarPanel: (panel: SidebarPanel) => void
  setGraphLayout: (layout: GraphLayoutMode) => void
  setGraphOverlay: (overlay: GraphOverlayMode) => void
  toggleTheme: () => void
}

interface AppStoreSelectors {
  selectVisibleNodes: () => GraphNode[]
  selectVisibleLinks: () => GraphLink[]
  selectSelectedNode: () => GraphNode | null
  selectHealthColor: () => string
}

export type AppStore = AppStoreState & AppStoreActions & AppStoreSelectors

const DEFAULT_GRAPH_FILTER: GraphFilter = {
  languages: [],
  minSize: 0,
  maxConnections: Number.POSITIVE_INFINITY,
  showOrphans: true,
}

let visibleNodesCache: {
  result: GraphNode[]
  analysisResult: AnalysisResult | null
  graphFilter: GraphFilter | null
} = {
  result: [],
  analysisResult: null,
  graphFilter: null,
}

let visibleLinksCache: {
  result: GraphLink[]
  analysisResult: AnalysisResult | null
  graphFilter: GraphFilter | null
} = {
  result: [],
  analysisResult: null,
  graphFilter: null,
}

const getLinksFromResult = (result: AnalysisResult | null): GraphLink[] => {
  if (!result) {
    return []
  }

  return result.graph.links.length > 0 ? result.graph.links : result.graph.edges
}

const normalizeAnalysisResult = (result: AnalysisResult): AnalysisResult => {
  const links = getLinksFromResult(result)

  return {
    ...result,
    graph: {
      ...result.graph,
      links: [...links],
      edges: [...links],
    },
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    immer((set, get) => ({
      mode: 'idle',
      repoInput: '',
      githubToken: '',
      analysisResult: null,
      selectedNodeId: null,
      hoveredNodeId: null,
      blastRadiusIds: new Set<string>(),
      highlightedLinks: new Set<string>(),
      graphFilter: { ...DEFAULT_GRAPH_FILTER },
      sidebarPanel: 'tree',
      graphLayout: 'force',
      graphOverlay: 'language',
      stages: [],
      error: null,
      warning: null,
      theme: 'dark',

      setRepoInput: (repoInput) =>
        set((state) => {
          state.repoInput = repoInput
        }),

      setGithubToken: (githubToken) =>
        set((state) => {
          state.githubToken = githubToken
        }),

      setMode: (mode) =>
        set((state) => {
          state.mode = mode
        }),

      setError: (error) =>
        set((state) => {
          state.error = error
          if (error) {
            state.mode = 'error'
          }
        }),

      clearError: () =>
        set((state) => {
          state.error = null
          if (state.mode === 'error') {
            state.mode = state.analysisResult ? 'ready' : 'idle'
          }
        }),

      setWarning: (warning) =>
        set((state) => {
          state.warning = warning
        }),

      setAnalysisResult: (result) =>
        set((state) => {
          if (!result) {
            state.analysisResult = null
            state.mode = 'idle'
            state.error = null
            state.warning = null
            state.selectedNodeId = null
            state.hoveredNodeId = null
            state.blastRadiusIds = new Set<string>()
            state.highlightedLinks = new Set<string>()
            state.stages = []
            return
          }

          const normalizedResult = normalizeAnalysisResult(result)
          const languages = Array.from(
            new Set(normalizedResult.graph.nodes.map((node) => node.language)),
          ).filter(Boolean)
          const maxConnections = normalizedResult.graph.nodes.reduce(
            (maxValue, node) => Math.max(maxValue, node.degree),
            0,
          )

          state.analysisResult = normalizedResult
          state.mode = 'ready'
          state.error = null
          state.warning =
            normalizedResult.skippedFiles && normalizedResult.skippedFiles.length > 0
              ? `Analysis complete - ${normalizedResult.skippedFiles.length} files skipped due to errors`
              : null
          state.selectedNodeId = null
          state.hoveredNodeId = null
          state.blastRadiusIds = new Set<string>()
          state.highlightedLinks = new Set<string>()

          state.graphFilter = {
            languages,
            minSize: 0,
            maxConnections:
              maxConnections > 0
                ? maxConnections
                : Number.POSITIVE_INFINITY,
            showOrphans: true,
          }
        }),

      selectNode: (id) =>
        set((state) => {
          state.selectedNodeId = id

          if (!id || !state.analysisResult) {
            state.blastRadiusIds = new Set<string>()
            state.highlightedLinks = new Set<string>()
            return
          }

          const blastResult = calculateBlastRadius(id, state.analysisResult.graph)
          const blastRadius = new Set<string>(blastResult.impactedNodeIds)
          const highlighted = new Set<string>(blastResult.impactedEdgeIds)

          state.blastRadiusIds = blastRadius
          state.highlightedLinks = highlighted
        }),

      clearSelection: () =>
        set((state) => {
          state.selectedNodeId = null
          state.hoveredNodeId = null
          state.blastRadiusIds = new Set<string>()
          state.highlightedLinks = new Set<string>()
        }),

      resetApp: () =>
        set((state) => {
          state.mode = 'idle'
          state.error = null
          state.warning = null
          state.analysisResult = null
          state.selectedNodeId = null
          state.hoveredNodeId = null
          state.blastRadiusIds = new Set<string>()
          state.highlightedLinks = new Set<string>()
          state.stages = []
        }),

      updateStage: (id, patch) =>
        set((state) => {
          const stage = state.stages.find((item) => item.id === id)
          if (stage) {
            Object.assign(stage, patch)
            return
          }

          state.stages.push({
            id,
            label: patch.label ?? id,
            status: patch.status ?? 'pending',
            progress: patch.progress,
          })
        }),

      setGraphFilter: (partial) =>
        set((state) => {
          state.graphFilter = { ...state.graphFilter, ...partial }
        }),

      setStages: (stages) =>
        set((state) => {
          state.stages = stages
        }),

      setSidebarPanel: (sidebarPanel) =>
        set((state) => {
          state.sidebarPanel = sidebarPanel
        }),

      setGraphLayout: (graphLayout) =>
        set((state) => {
          state.graphLayout = graphLayout
        }),

      setGraphOverlay: (graphOverlay) =>
        set((state) => {
          state.graphOverlay = graphOverlay
        }),

      toggleTheme: () =>
        set((state) => {
          state.theme = state.theme === 'dark' ? 'light' : 'dark'
        }),

      // Computed selectors are functions that derive values from current state.
      selectVisibleNodes: () => {
        const { analysisResult, graphFilter } = get()

        if (!analysisResult) {
          return []
        }

        if (
          visibleNodesCache.analysisResult === analysisResult &&
          visibleNodesCache.graphFilter === graphFilter
        ) {
          return visibleNodesCache.result
        }

        const result = analysisResult.graph.nodes.filter((node) => {
          const languageMatch =
            graphFilter.languages.length === 0 ||
            graphFilter.languages.includes(node.language)
          const sizeMatch = node.size >= graphFilter.minSize
          const connectionMatch = node.degree <= graphFilter.maxConnections
          const orphanMatch = graphFilter.showOrphans || node.degree > 0

          return languageMatch && sizeMatch && connectionMatch && orphanMatch
        })

        visibleNodesCache = {
          result,
          analysisResult,
          graphFilter,
        }

        return result
      },

      selectVisibleLinks: () => {
        const state = get()
        const visibleNodeIds = new Set(state.selectVisibleNodes().map((n) => n.id))
        const links = getLinksFromResult(state.analysisResult)

        if (visibleNodeIds.size === 0 || links.length === 0) {
          return []
        }

        if (
          visibleLinksCache.analysisResult === state.analysisResult &&
          visibleLinksCache.graphFilter === state.graphFilter
        ) {
          return visibleLinksCache.result
        }

        const result = links.filter(
          (link) =>
            visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target),
        )

        visibleLinksCache = {
          result,
          analysisResult: state.analysisResult,
          graphFilter: state.graphFilter,
        }

        return result
      },

      selectSelectedNode: () => {
        const { analysisResult, selectedNodeId } = get()

        if (!analysisResult || !selectedNodeId) {
          return null
        }

        return (
          analysisResult.graph.nodes.find((node) => node.id === selectedNodeId) ??
          null
        )
      },

      selectHealthColor: () => {
        const score = get().analysisResult?.health.overall ?? 0

        if (score >= 85) {
          return '#16a34a'
        }
        if (score >= 70) {
          return '#65a30d'
        }
        if (score >= 50) {
          return '#d97706'
        }

        return '#dc2626'
      },
    })),
    {
      name: 'codelens-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        githubToken: state.githubToken,
        graphLayout: state.graphLayout,
        graphOverlay: state.graphOverlay,
        sidebarPanel: state.sidebarPanel,
        theme: state.theme,
      }),
    },
  ),
)
