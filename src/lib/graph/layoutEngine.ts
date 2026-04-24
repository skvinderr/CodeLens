import * as d3 from 'd3'
import type { GraphData, GraphNode } from '@/types'
import type { GraphLayoutMode } from '@/store/useAppStore'

export interface LayoutOptions {
  width: number
  height: number
  mode: GraphLayoutMode
}

export function runLayoutEngine(graph: GraphData, options: LayoutOptions): GraphData {
  const nodes = graph.nodes.map((node) => ({ ...node }))

  if (nodes.length === 0) {
    return { ...graph, nodes }
  }

  switch (options.mode) {
    case 'radial':
      applyRadialLayout(nodes, graph, options.width, options.height)
      break
    case 'hierarchical':
      applyHierarchicalLayout(nodes, options.width, options.height)
      break
    case 'cluster':
      applyClusterLayout(nodes, options.width, options.height)
      break
    case 'force':
    default:
      applyForceSeed(nodes, options.width, options.height)
      break
  }

  return {
    ...graph,
    nodes,
  }
}

function applyForceSeed(nodes: GraphNode[], width: number, height: number): void {
  const centerX = width / 2
  const centerY = height / 2
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length)
    const radius = 36 + (index % 7) * 12
    node.x = centerX + Math.cos(angle) * radius
    node.y = centerY + Math.sin(angle) * radius
  })
}

function applyRadialLayout(
  nodes: GraphNode[],
  graph: GraphData,
  width: number,
  height: number,
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const root = findEntryPoint(nodes)
  const adjacency = new Map<string, string[]>()

  nodes.forEach((node) => adjacency.set(node.id, []))
  graph.links.forEach((link) => {
    adjacency.get(link.source)?.push(link.target)
    adjacency.get(link.target)?.push(link.source)
  })

  const depths = new Map<string, number>()
  const queue: string[] = [root.id]
  depths.set(root.id, 0)

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) {
      continue
    }

    const currentDepth = depths.get(currentId) ?? 0
    for (const neighborId of adjacency.get(currentId) ?? []) {
      if (!depths.has(neighborId)) {
        depths.set(neighborId, currentDepth + 1)
        queue.push(neighborId)
      }
    }
  }

  const maxDepth = d3.max([...depths.values()]) ?? 0
  const orphanDepth = maxDepth + 1
  const centerX = width / 2
  const centerY = height / 2
  const grouped = new Map<number, GraphNode[]>()

  nodes.forEach((node) => {
    const depth = depths.get(node.id) ?? orphanDepth
    if (!grouped.has(depth)) {
      grouped.set(depth, [])
    }
    grouped.get(depth)?.push(node)
  })

  root.x = centerX
  root.y = centerY

  for (const [depth, levelNodes] of grouped.entries()) {
    if (depth === 0) {
      continue
    }

    levelNodes.sort((left, right) => left.path.localeCompare(right.path))
    const radius = depth * 120
    levelNodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, levelNodes.length)
      const targetX = centerX + Math.cos(angle) * radius
      const targetY = centerY + Math.sin(angle) * radius
      node.x = targetX
      node.y = targetY
    })
  }

  const radialForce = d3
    .forceSimulation(nodes as Array<GraphNode & d3.SimulationNodeDatum>)
    .force(
      'radial',
      d3
        .forceRadial<GraphNode & d3.SimulationNodeDatum>(
          (node) => (depths.get(node.id) ?? orphanDepth) * 120,
          centerX,
          centerY,
        )
        .strength(1),
    )
    .force('collide', d3.forceCollide<GraphNode & d3.SimulationNodeDatum>(18))
    .stop()

  for (let index = 0; index < 120; index += 1) {
    radialForce.tick()
  }

  nodes.forEach((node) => {
    const hydrated = nodeById.get(node.id)
    if (hydrated) {
      hydrated.x = node.x
      hydrated.y = node.y
    }
  })
}

function applyHierarchicalLayout(nodes: GraphNode[], width: number, height: number): void {
  const pathSet = new Set<string>()
  const entries = new Map<string, { id: string; parentId?: string; original?: GraphNode }>()

  entries.set('__root__', { id: '__root__' })

  nodes.forEach((node) => {
    const segments = node.path.split('/').filter(Boolean)
    let current = ''
    segments.forEach((segment, index) => {
      current = current ? `${current}/${segment}` : segment
      if (pathSet.has(current)) {
        return
      }
      pathSet.add(current)
      entries.set(current, {
        id: current,
        parentId: index === 0 ? '__root__' : current.split('/').slice(0, -1).join('/'),
        original: index === segments.length - 1 ? node : undefined,
      })
    })
  })

  const stratified = d3
    .stratify<{ id: string; parentId?: string; original?: GraphNode }>()
    .id((entry) => entry.id)
    .parentId((entry) => entry.parentId)([...entries.values()])

  const layout = d3.tree<typeof stratified.data>().size([height - 80, width - 200])
  const treeRoot = layout(stratified)

  treeRoot.descendants().forEach((entry) => {
    const original = entry.data.original
    if (!original) {
      return
    }

    original.x = entry.y + 100
    original.y = entry.x + 40
  })
}

function applyClusterLayout(nodes: GraphNode[], width: number, height: number): void {
  const centerX = width / 2
  const centerY = height / 2
  const groups = d3.group(nodes, (node) => node.group || node.path.split('/')[0] || 'root')
  const groupEntries = [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  const radius = Math.max(160, Math.min(width, height) * 0.32)

  groupEntries.forEach(([groupName, groupNodes], groupIndex) => {
    const angle = (Math.PI * 2 * groupIndex) / Math.max(1, groupEntries.length)
    const centroidX = centerX + Math.cos(angle) * radius
    const centroidY = centerY + Math.sin(angle) * radius
    const simulation = d3
      .forceSimulation(groupNodes as Array<GraphNode & d3.SimulationNodeDatum>)
      .force('charge', d3.forceManyBody<GraphNode & d3.SimulationNodeDatum>().strength(-55))
      .force('center', d3.forceCenter(centroidX, centroidY))
      .force('collide', d3.forceCollide<GraphNode & d3.SimulationNodeDatum>(18))
      .stop()

    groupNodes.forEach((node, index) => {
      const offsetAngle = (Math.PI * 2 * index) / Math.max(1, groupNodes.length)
      node.x = centroidX + Math.cos(offsetAngle) * 24
      node.y = centroidY + Math.sin(offsetAngle) * 24
      node.group = groupName
    })

    for (let tick = 0; tick < 80; tick += 1) {
      simulation.tick()
    }
  })
}

function findEntryPoint(nodes: GraphNode[]): GraphNode {
  const preferred = ['index.ts', 'main.ts', 'App.tsx', 'server.ts', 'index.js']
  for (const fileName of preferred) {
    const match = nodes.find((node) => node.path.endsWith(fileName))
    if (match) {
      return match
    }
  }

  return [...nodes].sort((left, right) => left.path.localeCompare(right.path))[0]
}
