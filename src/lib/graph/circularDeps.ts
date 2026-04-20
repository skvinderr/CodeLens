import type { GraphData } from '@/types'

export interface CircularDependency {
  path: string[]
}

export function findCircularDependencies(graph: GraphData): CircularDependency[] {
  void graph
  return []
}
