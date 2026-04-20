import type { BlastAffectedNode, BlastRadiusResult, GraphData } from '@/types'

export function calculateBlastRadius(
  nodeId: string,
  graph: GraphData,
  maxDepth = 4,
): BlastRadiusResult {
  const links = graph.links.length > 0 ? graph.links : graph.edges
  const boundedDepth = Math.max(1, Math.floor(maxDepth))
  const allNodeIds = new Set(graph.nodes.map((node) => node.id))
  const incomingAdjacency = new Map<string, string[]>()
  const outgoingAdjacency = new Map<string, string[]>()

  for (const link of links) {
    if (!incomingAdjacency.has(link.target)) {
      incomingAdjacency.set(link.target, [])
    }
    incomingAdjacency.get(link.target)?.push(link.source)

    if (!outgoingAdjacency.has(link.source)) {
      outgoingAdjacency.set(link.source, [])
    }
    outgoingAdjacency.get(link.source)?.push(link.target)
  }

  type TraversalResult = {
    distanceByNode: Map<string, number>
    viaByNode: Map<string, string | null>
    edgeIds: Set<string>
  }

  const runBreadthFirst = (
    adjacency: Map<string, string[]>,
    seed: string,
    depthLimit: number,
    edgeIdBuilder: (from: string, to: string) => string,
  ): TraversalResult => {
    const distanceByNode = new Map<string, number>([[seed, 0]])
    const viaByNode = new Map<string, string | null>([[seed, null]])
    const edgeIds = new Set<string>()
    const queue: string[] = [seed]

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) {
        continue
      }

      const depth = distanceByNode.get(current) ?? 0
      if (depth >= depthLimit) {
        continue
      }

      for (const next of adjacency.get(current) ?? []) {
        const nextDepth = depth + 1
        if (nextDepth > depthLimit) {
          continue
        }

        edgeIds.add(edgeIdBuilder(current, next))

        if (!distanceByNode.has(next)) {
          distanceByNode.set(next, nextDepth)
          viaByNode.set(next, current)
          queue.push(next)
        }
      }
    }

    return { distanceByNode, viaByNode, edgeIds }
  }

  const incomingTraversal = runBreadthFirst(
    incomingAdjacency,
    nodeId,
    boundedDepth,
    (current, importer) => `${importer}::${current}`,
  )

  const outgoingTraversal = runBreadthFirst(
    outgoingAdjacency,
    nodeId,
    boundedDepth,
    (current, dependency) => `${current}::${dependency}`,
  )

  const affected = new Map<string, BlastAffectedNode>()

  const ensureAffectedNode = (id: string): BlastAffectedNode => {
    const existing = affected.get(id)
    if (existing) {
      return existing
    }

    const next = { nodeId: id }
    affected.set(id, next)
    return next
  }

  ensureAffectedNode(nodeId).dependentDistance = 0
  ensureAffectedNode(nodeId).dependencyDistance = 0

  for (const [id, distance] of incomingTraversal.distanceByNode.entries()) {
    if (!allNodeIds.has(id)) {
      continue
    }

    ensureAffectedNode(id).dependentDistance = distance
  }

  for (const [id, distance] of outgoingTraversal.distanceByNode.entries()) {
    if (!allNodeIds.has(id)) {
      continue
    }

    ensureAffectedNode(id).dependencyDistance = distance
  }

  const dependents = [...incomingTraversal.distanceByNode.entries()]
    .filter(([id]) => id !== nodeId)
    .map(([id, distance]) => ({
      nodeId: id,
      distance,
      via: incomingTraversal.viaByNode.get(id) ?? null,
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance
      }
      return left.nodeId.localeCompare(right.nodeId)
    })

  const dependencies = [...outgoingTraversal.distanceByNode.entries()]
    .filter(([id]) => id !== nodeId)
    .map(([id, distance]) => ({
      nodeId: id,
      distance,
      via: outgoingTraversal.viaByNode.get(id) ?? null,
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance
      }
      return left.nodeId.localeCompare(right.nodeId)
    })

  const depthBuckets = {
    depth1: 0,
    depth2: 0,
    depth3: 0,
    depth4plus: 0,
  }

  for (const { distance } of dependents) {
    if (distance <= 0) {
      continue
    }

    if (distance === 1) {
      depthBuckets.depth1 += 1
    } else if (distance === 2) {
      depthBuckets.depth2 += 1
    } else if (distance === 3) {
      depthBuckets.depth3 += 1
    } else {
      depthBuckets.depth4plus += 1
    }
  }

  const weightedImpact =
    depthBuckets.depth1 * 3 +
    depthBuckets.depth2 * 2 +
    depthBuckets.depth3 * 1 +
    depthBuckets.depth4plus * 0.5

  const maxPotential = Math.max(1, (graph.nodes.length - 1) * 3)
  const score = Math.max(0, Math.min(100, Math.round((weightedImpact / maxPotential) * 100)))

  const impactedEdgeIds = new Set<string>()
  for (const edgeId of incomingTraversal.edgeIds) {
    impactedEdgeIds.add(edgeId)
  }
  for (const edgeId of outgoingTraversal.edgeIds) {
    impactedEdgeIds.add(edgeId)
  }

  return {
    seedNodeId: nodeId,
    affected,
    dependents,
    dependencies,
    impactedNodeIds: [...affected.keys()],
    impactedEdgeIds: [...impactedEdgeIds],
    score,
    maxDepth: boundedDepth,
  }
}
