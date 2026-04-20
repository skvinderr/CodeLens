import type { BlastRadiusResult, GraphData } from '@/types'

export function calculateBlastRadius(
  graph: GraphData,
  seedNodeId: string,
): BlastRadiusResult {
  void graph
  return {
    seedNodeId,
    impactedNodeIds: [],
    impactedEdgeIds: [],
    score: 0,
  }
}
