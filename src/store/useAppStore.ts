import { create } from 'zustand'
import type { AppStatus, GraphData, RepositorySource } from '@/types'

interface AppStore {
  source: RepositorySource
  githubToken: string
  graph: GraphData
  status: AppStatus
  selectedNodeId: string | null
  setSource: (source: RepositorySource) => void
  setGitHubToken: (token: string) => void
  setGraph: (graph: GraphData) => void
  setStatus: (status: AppStatus) => void
  setSelectedNodeId: (nodeId: string | null) => void
}

export const useAppStore = create<AppStore>((set) => ({
  source: 'github',
  githubToken: '',
  graph: { nodes: [], links: [], edges: [] },
  status: { message: 'Waiting for repository input', kind: 'idle' },
  selectedNodeId: null,
  setSource: (source) => set({ source }),
  setGitHubToken: (githubToken) => set({ githubToken }),
  setGraph: (graph) => set({ graph }),
  setStatus: (status) => set({ status }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
}))
