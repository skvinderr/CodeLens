import type { CodeLensFileNode, GraphData } from '@/types'

export interface BuildGraphOptions {
  includeExternal?: boolean
}

export function buildGraphFromFiles(
  files: CodeLensFileNode[],
  options: BuildGraphOptions = {},
): GraphData {
  void files
  void options
  return { nodes: [], links: [], edges: [] }
}
