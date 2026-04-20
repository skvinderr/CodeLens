export type RepositorySource = 'github' | 'local'

export interface CodeLensFileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
  children?: CodeLensFileNode[]
}

export interface Contributor {
  id: string
  name: string
  email?: string
  commits: number
}

export interface SecurityFinding {
  id: string
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  filePath: string
  line?: number
  message: string
}

export interface HealthScore {
  maintainability: number
  testCoverage: number
  dependencyFreshness: number
  overall: number
}

export interface GraphNode {
  id: string
  label: string
  filePath: string
  category: 'entry' | 'module' | 'service' | 'package'
  riskLevel?: 'low' | 'medium' | 'high'
  x?: number
  y?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation: 'imports' | 'calls' | 'owns' | 'depends-on'
  weight?: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface BlastRadiusResult {
  seedNodeId: string
  impactedNodeIds: string[]
  impactedEdgeIds: string[]
  score: number
}

export interface RateLimitState {
  limit: number
  remaining: number
  resetAt: number
}

export interface AppStatus {
  message: string
  kind: 'idle' | 'loading' | 'ready' | 'error'
}
