import type { GraphData } from '@/types'

export interface CircularDependency {
  cycle: string[]
  length: number
}

export function findCircularDependencies(graph: GraphData): CircularDependency[] {
  const nodes = graph.nodes.map((node) => node.id)
  const links = graph.links.length > 0 ? graph.links : graph.edges
  const adjacency = new Map<string, string[]>()

  for (const nodeId of nodes) {
    adjacency.set(nodeId, [])
  }

  for (const link of links) {
    if (!adjacency.has(link.source)) {
      adjacency.set(link.source, [])
    }
    adjacency.get(link.source)?.push(link.target)

    if (!adjacency.has(link.target)) {
      adjacency.set(link.target, [])
    }
  }

  let nextIndex = 0
  const indexByNode = new Map<string, number>()
  const lowLinkByNode = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []

  const strongConnect = (nodeId: string) => {
    indexByNode.set(nodeId, nextIndex)
    lowLinkByNode.set(nodeId, nextIndex)
    nextIndex += 1

    stack.push(nodeId)
    onStack.add(nodeId)

    for (const neighborId of adjacency.get(nodeId) ?? []) {
      if (!indexByNode.has(neighborId)) {
        strongConnect(neighborId)
        const lowLink = Math.min(
          lowLinkByNode.get(nodeId) ?? Number.POSITIVE_INFINITY,
          lowLinkByNode.get(neighborId) ?? Number.POSITIVE_INFINITY,
        )
        lowLinkByNode.set(nodeId, lowLink)
      } else if (onStack.has(neighborId)) {
        const lowLink = Math.min(
          lowLinkByNode.get(nodeId) ?? Number.POSITIVE_INFINITY,
          indexByNode.get(neighborId) ?? Number.POSITIVE_INFINITY,
        )
        lowLinkByNode.set(nodeId, lowLink)
      }
    }

    if (lowLinkByNode.get(nodeId) === indexByNode.get(nodeId)) {
      const component: string[] = []

      while (stack.length > 0) {
        const poppedId = stack.pop()
        if (!poppedId) {
          continue
        }

        onStack.delete(poppedId)
        component.push(poppedId)

        if (poppedId === nodeId) {
          break
        }
      }

      components.push(component)
    }
  }

  for (const nodeId of adjacency.keys()) {
    if (!indexByNode.has(nodeId)) {
      strongConnect(nodeId)
    }
  }

  const results: CircularDependency[] = []

  for (const component of components) {
    if (component.length > 1) {
      const ordered = [...component].sort((left, right) => left.localeCompare(right))
      results.push({ cycle: ordered, length: ordered.length })
      continue
    }

    const [single] = component
    if (!single) {
      continue
    }

    const hasSelfLoop = (adjacency.get(single) ?? []).includes(single)
    if (hasSelfLoop) {
      results.push({ cycle: [single], length: 1 })
    }
  }

  return results.sort((left, right) => {
    if (left.length !== right.length) {
      return right.length - left.length
    }

    return left.cycle[0].localeCompare(right.cycle[0])
  })
}
