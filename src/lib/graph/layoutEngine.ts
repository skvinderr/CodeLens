import type { GraphData } from '@/types'

export interface LayoutOptions {
  width: number
  height: number
}

export function runLayoutEngine(graph: GraphData, options: LayoutOptions): GraphData {
  void options
  return graph
}
