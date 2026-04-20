export interface RepoInfo {
  owner: string
  name: string
  branch: string
  url: string
  description: string
  stars: number
  language: string
  defaultBranch: string
}

export interface FileNode {
  id: string
  path: string
  name: string
  extension: string
  language: string
  size: number
  content?: string
  imports: string[]
  exports: string[]
  lastModified?: Date
  lineCount?: number
}

export interface GraphNode extends FileNode {
  x?: number
  y?: number
  fx?: number
  fy?: number
  group: string
  blastScore: number
  isCircularDep: boolean
  degree: number

  // Compatibility fields for current scaffold placeholders.
  label?: string
  filePath?: string
}

export interface GraphLink {
  source: string
  target: string
  type: 'import' | 're-export' | 'dynamic' | 'css' | 'unknown'
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]

  // Compatibility alias until all scaffold modules are switched to links.
  edges: GraphLink[]
}

export interface Contributor {
  login: string
  avatarUrl: string
  commits: number
  additions: number
  deletions: number
  lastCommit: Date
}

export interface FileContributors {
  filePath: string
  contributors: Contributor[]
  totalCommits: number
}

export type AlertType =
  | 'api-key'
  | 'private-key'
  | 'password'
  | 'jwt'
  | 'webhook-url'
  | 'connection-string'
  | 'hardcoded-ip'
  | 'todo-security'

export interface SecurityAlert {
  id: string
  filePath: string
  line: number
  type: AlertType
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  snippet: string
  recommendation: string
}

export interface HealthCategories {
  dependencies: number
  security: number
  complexity: number
  documentation: number
  testCoverage: number
  codeSmells: number
}

export type NegativeNumber = number

export interface HealthFinding {
  category: keyof HealthCategories | string
  message: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  affectedFiles: string[]
  score: NegativeNumber
}

export interface HealthScore {
  overall: number
  categories: HealthCategories
  breakdown: HealthFinding[]

  // Compatibility fields for initial scaffold components.
  maintainability?: number
  dependencyFreshness?: number
}

export interface TechStack {
  frameworks: string[]
  languages: Record<string, number>
  packageManager?: string
  hasTests: boolean
  hasCI: boolean
  hasDocs: boolean
}

export interface AnalysisResult {
  repo: RepoInfo
  files: FileNode[]
  graph: GraphData
  contributors: Map<string, FileContributors>
  health: HealthScore
  security: SecurityAlert[]
  circularDeps: string[][]
  techStack: TechStack
  analyzedAt: Date
}

export type AppMode = 'idle' | 'loading' | 'ready' | 'error'

export interface AnalysisStage {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  progress?: number
}

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

export type GraphEdge = GraphLink

export type SecurityFinding = SecurityAlert & {
  title?: string
  message?: string
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
  kind: AppMode
}
