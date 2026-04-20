import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { GraphControls, type GraphViewMode } from '@/components/graph/GraphControls'
import { MiniMap } from '@/components/graph/MiniMap'
import { NodeTooltip } from '@/components/graph/NodeTooltip'
import { useAppStore } from '@/store/useAppStore'
import { darkenHex, languageToColor, withSaturation } from '@/utils/colorUtils'
import type { GraphEdge, GraphNode } from '@/types'

export interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeSelect?: (nodeId: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  nodeId: string
}

type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>
type SimulationNode = GraphNode & d3.SimulationNodeDatum

type SimulationLink = d3.SimulationLinkDatum<SimulationNode> &
  Omit<GraphEdge, 'source' | 'target'> & {
    source: string | SimulationNode
    target: string | SimulationNode
  }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getNodePath(node: GraphNode): string {
  return node.path || node.filePath || node.id
}

function getNodeFilename(node: GraphNode): string {
  const source = getNodePath(node)
  const segments = source.split('/')
  return segments[segments.length - 1] || node.name || node.id
}

function truncateLabel(value: string, maxLength = 18): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

function getNodeLanguageKey(node: GraphNode): string {
  return (node.language || node.extension || 'other').toLowerCase()
}

function defaultNodeRadius(node: GraphNode): number {
  return Math.max(6, Math.min(20, Math.log((node.size ?? 0) + 1) * 3))
}

function heatmapNodeRadius(node: GraphNode): number {
  const loc =
    node.lineCount ?? Math.max(1, Math.round(Math.max(1, node.size ?? 0) / 42))
  return clamp(Math.sqrt(loc) * 1.35, 6, 24)
}

function normalizeBlastScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0
  }

  if (score <= 1) {
    return clamp(score, 0, 1)
  }

  return clamp(score / 100, 0, 1)
}

function sourceNodeId(link: SimulationLink): string {
  return typeof link.source === 'string' ? link.source : link.source.id
}

function targetNodeId(link: SimulationLink): string {
  return typeof link.target === 'string' ? link.target : link.target.id
}

function nodeRadiusByMode(node: GraphNode, mode: GraphViewMode): number {
  return mode === 'heatmap' ? heatmapNodeRadius(node) : defaultNodeRadius(node)
}

function nodeColorByMode(node: GraphNode, mode: GraphViewMode): string {
  if (mode === 'heatmap') {
    return d3.interpolateTurbo(normalizeBlastScore(node.blastScore))
  }

  return languageToColor(node.language || node.extension)
}

export function GraphCanvas({ nodes, edges, onNodeSelect }: GraphCanvasProps) {
  const selectNode = useAppStore((state) => state.selectNode)
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const repo = useAppStore((state) => state.analysisResult?.repo ?? null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const simulationRef = useRef<d3.Simulation<SimulationNode, undefined> | null>(null)
  const simulationNodesRef = useRef<GraphNode[]>([])
  const quadtreeRef = useRef<d3.Quadtree<SimulationNode> | null>(null)
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)

  const svgSelectionRef = useRef<SvgSelection | null>(null)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const markerIdRef = useRef(`cl-arrow-${Math.random().toString(36).slice(2, 10)}`)
  const nodeMapRef = useRef<Map<string, SimulationNode>>(new Map())
  const pinnedNodeIdsRef = useRef<Set<string>>(new Set())

  const nodeSelectionRef = useRef<
    d3.Selection<SVGCircleElement, SimulationNode, SVGGElement, unknown> | null
  >(null)
  const linkSelectionRef = useRef<
    d3.Selection<SVGLineElement, SimulationLink, SVGGElement, unknown> | null
  >(null)
  const labelSelectionRef = useRef<
    d3.Selection<SVGTextElement, SimulationNode, SVGGElement, unknown> | null
  >(null)

  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [zoomLevel, setZoomLevel] = useState(1)
  const [viewMode, setViewMode] = useState<GraphViewMode>('force')
  const [showOrphans, setShowOrphans] = useState(true)
  const [hiddenLanguages, setHiddenLanguages] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const detectedLanguages = useMemo(
    () =>
      Array.from(new Set(nodes.map((node) => getNodeLanguageKey(node)))).sort(
        (left, right) => left.localeCompare(right),
      ),
    [nodes],
  )

  useEffect(() => {
    setHiddenLanguages((current) =>
      current.filter((language) => detectedLanguages.includes(language)),
    )
  }, [detectedLanguages])

  const filteredNodes = useMemo(
    () =>
      nodes.filter((node) => {
        const languageHidden = hiddenLanguages.includes(getNodeLanguageKey(node))
        const orphanHidden = !showOrphans && node.isOrphan

        return !languageHidden && !orphanHidden
      }),
    [hiddenLanguages, nodes, showOrphans],
  )

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes],
  )

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (edge) =>
          filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target),
      ),
    [edges, filteredNodeIds],
  )

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const matchingNodeIds = useMemo(() => {
    if (!normalizedSearch) {
      return new Set<string>()
    }

    return new Set(
      filteredNodes
        .filter((node) => {
          const path = getNodePath(node).toLowerCase()
          const name = (node.name || getNodeFilename(node)).toLowerCase()
          return path.includes(normalizedSearch) || name.includes(normalizedSearch)
        })
        .map((node) => node.id),
    )
  }, [filteredNodes, normalizedSearch])

  const contextNode = useMemo(() => {
    if (!contextMenu) {
      return null
    }

    return nodeMapRef.current.get(contextMenu.nodeId) ?? null
  }, [contextMenu, filteredNodes])

  const applyInteractionStyles = useCallback(() => {
    const hoveredId = hoveredNode?.id ?? null
    const searching = normalizedSearch.length > 0

    nodeSelectionRef.current
      ?.attr('opacity', (nodeDatum) => {
        if (!searching) {
          return 1
        }

        return matchingNodeIds.has(nodeDatum.id) ? 1 : 0.16
      })
      .attr('stroke-opacity', (nodeDatum) => {
        if (nodeDatum.id === selectedNodeId || nodeDatum.id === hoveredId) {
          return 1
        }

        if (searching && matchingNodeIds.has(nodeDatum.id)) {
          return 0.85
        }

        return 0
      })

    linkSelectionRef.current?.attr('stroke-opacity', (linkDatum) => {
      let opacity = 0.25

      if (selectedNodeId) {
        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        opacity = source === selectedNodeId || target === selectedNodeId ? 0.85 : 0.25
      }

      if (searching) {
        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        const touchesSearch =
          matchingNodeIds.has(source) || matchingNodeIds.has(target)

        opacity = touchesSearch ? Math.max(opacity, 0.55) : opacity * 0.2
      }

      return opacity
    })

    labelSelectionRef.current?.attr('opacity', (nodeDatum) => {
      if (!searching) {
        return 1
      }

      return matchingNodeIds.has(nodeDatum.id) ? 1 : 0.2
    })
  }, [hoveredNode?.id, matchingNodeIds, normalizedSearch, selectedNodeId])

  const applyZoomTransform = useCallback(
    (transform: d3.ZoomTransform, duration = 220) => {
      const svgSelection = svgSelectionRef.current
      const zoomBehavior = zoomBehaviorRef.current

      if (!svgSelection || !zoomBehavior) {
        return
      }

      if (duration > 0) {
        svgSelection
          .transition()
          .duration(duration)
          .call(zoomBehavior.transform, transform)
        return
      }

      svgSelection.call(zoomBehavior.transform, transform)
    },
    [],
  )

  const panToCenter = useCallback(
    (center: { x: number; y: number }) => {
      if (viewport.width <= 0 || viewport.height <= 0) {
        return
      }

      const k = Math.max(0.1, zoomTransformRef.current.k)
      const nextTransform = d3.zoomIdentity
        .translate(viewport.width / 2 - center.x * k, viewport.height / 2 - center.y * k)
        .scale(k)

      applyZoomTransform(nextTransform, 0)
    },
    [applyZoomTransform, viewport.height, viewport.width],
  )

  const handleZoomDelta = useCallback(
    (factor: number) => {
      if (viewport.width <= 0 || viewport.height <= 0) {
        return
      }

      const current = zoomTransformRef.current
      const nextK = clamp(current.k * factor, 0.1, 8)
      const viewportCenter: [number, number] = [viewport.width / 2, viewport.height / 2]
      const [worldX, worldY] = current.invert(viewportCenter)

      const nextTransform = d3.zoomIdentity
        .translate(viewportCenter[0] - worldX * nextK, viewportCenter[1] - worldY * nextK)
        .scale(nextK)

      applyZoomTransform(nextTransform)
    },
    [applyZoomTransform, viewport.height, viewport.width],
  )

  const handleFitAll = useCallback(() => {
    const simulationNodes = simulationNodesRef.current.filter(
      (node): node is GraphNode & { x: number; y: number } =>
        Number.isFinite(node.x) && Number.isFinite(node.y),
    )

    if (simulationNodes.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
      return
    }

    const minX = d3.min(simulationNodes, (node) => node.x) ?? 0
    const maxX = d3.max(simulationNodes, (node) => node.x) ?? viewport.width
    const minY = d3.min(simulationNodes, (node) => node.y) ?? 0
    const maxY = d3.max(simulationNodes, (node) => node.y) ?? viewport.height

    const boundsWidth = Math.max(1, maxX - minX)
    const boundsHeight = Math.max(1, maxY - minY)
    const scale = clamp(
      0.9 / Math.max(boundsWidth / viewport.width, boundsHeight / viewport.height),
      0.1,
      8,
    )

    const centerX = minX + boundsWidth / 2
    const centerY = minY + boundsHeight / 2

    const nextTransform = d3.zoomIdentity
      .translate(viewport.width / 2 - centerX * scale, viewport.height / 2 - centerY * scale)
      .scale(scale)

    applyZoomTransform(nextTransform, 260)
  }, [applyZoomTransform, viewport.height, viewport.width])

  const handleResetLayout = useCallback(() => {
    const simulation = simulationRef.current
    const simulationNodes = simulationNodesRef.current as SimulationNode[]
    if (!simulation || viewport.width <= 0 || viewport.height <= 0) {
      return
    }

    pinnedNodeIdsRef.current.clear()

    for (const node of simulationNodes) {
      node.fx = undefined
      node.fy = undefined
      node.x = viewport.width / 2 + (Math.random() - 0.5) * 180
      node.y = viewport.height / 2 + (Math.random() - 0.5) * 130
    }

    simulation.alpha(1).restart()
  }, [viewport.height, viewport.width])

  const handlePinAll = useCallback(() => {
    for (const node of simulationNodesRef.current as SimulationNode[]) {
      node.fx = node.x ?? viewport.width / 2
      node.fy = node.y ?? viewport.height / 2
      pinnedNodeIdsRef.current.add(node.id)
    }
  }, [viewport.height, viewport.width])

  const handleReleaseAll = useCallback(() => {
    const simulation = simulationRef.current

    for (const node of simulationNodesRef.current as SimulationNode[]) {
      node.fx = undefined
      node.fy = undefined
    }

    pinnedNodeIdsRef.current.clear()
    simulation?.alpha(0.25).restart()
  }, [])

  const toggleLanguage = useCallback((language: string) => {
    setHiddenLanguages((current) =>
      current.includes(language)
        ? current.filter((value) => value !== language)
        : [...current, language],
    )
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setViewport({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      })
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || viewport.width <= 0 || viewport.height <= 0) {
      return
    }

    const svg = d3
      .select(svgRef.current)
      .attr('width', viewport.width)
      .attr('height', viewport.height)
      .attr('viewBox', `0 0 ${viewport.width} ${viewport.height}`)

    svgSelectionRef.current = svg

    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    defs
      .append('marker')
      .attr('id', markerIdRef.current)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 9)
      .attr('refY', 5)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', 'rgba(124, 142, 159, 0.9)')

    const zoomLayer = svg.append('g').attr('class', 'graph-zoom-layer')
    const linkLayer = zoomLayer.append('g').attr('class', 'graph-link-layer')
    const nodeLayer = zoomLayer.append('g').attr('class', 'graph-node-layer')
    const labelLayer = zoomLayer.append('g').attr('class', 'graph-label-layer')

    const previousNodes = nodeMapRef.current

    const simulationNodes: SimulationNode[] = filteredNodes.map((node) => {
      const previous = previousNodes.get(node.id)
      return {
        ...node,
        x: previous?.x ?? viewport.width / 2 + (Math.random() - 0.5) * 80,
        y: previous?.y ?? viewport.height / 2 + (Math.random() - 0.5) * 80,
        fx: previous?.fx,
        fy: previous?.fy,
      }
    })

    const simulationLinks: SimulationLink[] = filteredEdges.map((edge) => ({
      ...edge,
      source: edge.source,
      target: edge.target,
    }))

    simulationNodesRef.current = simulationNodes
    nodeMapRef.current = new Map(simulationNodes.map((node) => [node.id, node]))

    const linkSelection = linkLayer
      .selectAll<SVGLineElement, SimulationLink>('line')
      .data(simulationLinks, (datum) => {
        const keySource = typeof datum.source === 'string' ? datum.source : datum.source.id
        const keyTarget = typeof datum.target === 'string' ? datum.target : datum.target.id
        return `${keySource}->${keyTarget}:${datum.type}`
      })
      .join('line')
      .attr('class', 'graph-link')
      .attr('marker-end', `url(#${markerIdRef.current})`)
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', (datum) => clamp(datum.weight ?? 1, 1, 4))
      .attr('stroke-opacity', 0.25)

    const nodeSelection = nodeLayer
      .selectAll<SVGCircleElement, SimulationNode>('circle')
      .data(simulationNodes, (datum) => datum.id)
      .join('circle')
      .attr('class', 'graph-node')
      .style('cursor', 'pointer')
      .on('click', (event, nodeDatum) => {
        event.stopPropagation()
        selectNode(nodeDatum.id)
        onNodeSelect?.(nodeDatum.id)
        setContextMenu(null)
      })
      .on('contextmenu', (event, nodeDatum) => {
        event.preventDefault()
        event.stopPropagation()

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          nodeId: nodeDatum.id,
        })
      })

    const labelSelection = labelLayer
      .selectAll<SVGTextElement, SimulationNode>('text')
      .data(simulationNodes, (datum) => datum.id)
      .join('text')
      .attr('class', 'graph-node-label')
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'hanging')
      .attr('fill', 'var(--cl-muted)')
      .style('pointer-events', 'none')
      .text((datum) => truncateLabel(getNodeFilename(datum), 18))
      .attr('display', 'none')

    const dragBehavior = d3
      .drag<SVGCircleElement, SimulationNode>()
      .on('start', (event, nodeDatum) => {
        if (!event.active) {
          simulationRef.current?.alphaTarget(0.2).restart()
        }
        nodeDatum.fx = nodeDatum.x
        nodeDatum.fy = nodeDatum.y
      })
      .on('drag', (event, nodeDatum) => {
        nodeDatum.fx = event.x
        nodeDatum.fy = event.y
      })
      .on('end', (event, nodeDatum) => {
        if (!event.active) {
          simulationRef.current?.alphaTarget(0)
        }
        nodeDatum.fx = nodeDatum.x
        nodeDatum.fy = nodeDatum.y
        pinnedNodeIdsRef.current.add(nodeDatum.id)
      })

    nodeSelection.call(dragBehavior)

    nodeSelectionRef.current = nodeSelection
    linkSelectionRef.current = linkSelection
    labelSelectionRef.current = labelSelection

    const colorForNode = (nodeDatum: SimulationNode): string =>
      nodeColorByMode(nodeDatum, viewMode)

    const radiusForNode = (nodeDatum: SimulationNode): number =>
      nodeRadiusByMode(nodeDatum, viewMode)

    nodeSelection
      .attr('r', (nodeDatum) => radiusForNode(nodeDatum))
      .attr('fill', (nodeDatum) => colorForNode(nodeDatum))
      .attr('stroke', (nodeDatum) => darkenHex(colorForNode(nodeDatum), 0.24))
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0)

    linkSelection.attr('stroke', (linkDatum) => {
      const source =
        typeof linkDatum.source === 'string'
          ? nodeMapRef.current.get(linkDatum.source)
          : linkDatum.source
      const sourceColor = source ? colorForNode(source) : '#7c8e9f'
      return withSaturation(sourceColor, 0.6)
    })

    const simulation = d3
      .forceSimulation<SimulationNode>(simulationNodes)
      .force(
        'link',
        d3
          .forceLink<SimulationNode, SimulationLink>(simulationLinks)
          .id((datum) => datum.id)
          .distance(80)
          .strength(0.3),
      )
      .force('charge', d3.forceManyBody<SimulationNode>().strength(-200))
      .force('center', d3.forceCenter(viewport.width / 2, viewport.height / 2))
      .force(
        'collide',
        d3
          .forceCollide<SimulationNode>()
          .radius((datum) => radiusForNode(datum) + 6),
      )
      .alphaDecay(0.028)

    if (viewMode === 'radial') {
      simulation
        .force(
          'radial',
          d3
            .forceRadial<SimulationNode>(
              Math.min(viewport.width, viewport.height) * 0.34,
              viewport.width / 2,
              viewport.height / 2,
            )
            .strength(0.18),
        )
        .force('x', null)
        .force('y', null)
    } else if (viewMode === 'hierarchical') {
      const adjacency = new Map<string, string[]>()
      for (const nodeDatum of simulationNodes) {
        adjacency.set(nodeDatum.id, [])
      }
      for (const linkDatum of simulationLinks) {
        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        adjacency.get(source)?.push(target)
      }

      const root =
        simulationNodes.reduce((current, nodeDatum) =>
          nodeDatum.degree > current.degree ? nodeDatum : current,
        ) ?? simulationNodes[0]

      const levelMap = new Map<string, number>()
      const queue: string[] = root ? [root.id] : []
      if (root) {
        levelMap.set(root.id, 0)
      }

      while (queue.length > 0) {
        const currentId = queue.shift()
        if (!currentId) {
          continue
        }

        const currentLevel = levelMap.get(currentId) ?? 0
        for (const nextId of adjacency.get(currentId) ?? []) {
          if (!levelMap.has(nextId)) {
            levelMap.set(nextId, currentLevel + 1)
            queue.push(nextId)
          }
        }
      }

      let fallbackLevel = d3.max([...levelMap.values()]) ?? 0
      for (const nodeDatum of simulationNodes) {
        if (!levelMap.has(nodeDatum.id)) {
          fallbackLevel += 1
          levelMap.set(nodeDatum.id, fallbackLevel)
        }
      }

      const levels = new Map<number, SimulationNode[]>()
      for (const nodeDatum of simulationNodes) {
        const level = levelMap.get(nodeDatum.id) ?? 0
        if (!levels.has(level)) {
          levels.set(level, [])
        }
        levels.get(level)?.push(nodeDatum)
      }

      const maxLevel = d3.max([...levels.keys()]) ?? 0
      const levelSpacing = maxLevel === 0 ? 0 : viewport.width / (maxLevel + 1)

      const targetById = new Map<string, { x: number; y: number }>()
      for (const [level, levelNodes] of levels.entries()) {
        const rowSpacing = viewport.height / (levelNodes.length + 1)
        levelNodes.forEach((nodeDatum, index) => {
          targetById.set(nodeDatum.id, {
            x: Math.max(36, 28 + level * levelSpacing),
            y: (index + 1) * rowSpacing,
          })
        })
      }

      simulation
        .force(
          'x',
          d3
            .forceX<SimulationNode>((nodeDatum) => targetById.get(nodeDatum.id)?.x ?? viewport.width / 2)
            .strength(0.7),
        )
        .force(
          'y',
          d3
            .forceY<SimulationNode>((nodeDatum) => targetById.get(nodeDatum.id)?.y ?? viewport.height / 2)
            .strength(0.55),
        )
        .force('radial', null)
    } else {
      simulation.force('radial', null).force('x', null).force('y', null)
    }

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (datum) => (typeof datum.source === 'string' ? 0 : (datum.source.x ?? 0)))
        .attr('y1', (datum) => (typeof datum.source === 'string' ? 0 : (datum.source.y ?? 0)))
        .attr('x2', (datum) => (typeof datum.target === 'string' ? 0 : (datum.target.x ?? 0)))
        .attr('y2', (datum) => (typeof datum.target === 'string' ? 0 : (datum.target.y ?? 0)))

      nodeSelection
        .attr('cx', (datum) => datum.x ?? 0)
        .attr('cy', (datum) => datum.y ?? 0)

      labelSelection
        .attr('x', (datum) => datum.x ?? 0)
        .attr('y', (datum) => (datum.y ?? 0) + radiusForNode(datum) + 4)

      quadtreeRef.current = d3.quadtree(
        simulationNodes,
        (datum) => datum.x ?? 0,
        (datum) => datum.y ?? 0,
      )

      simulationNodesRef.current = simulationNodes
    })

    simulationRef.current = simulation

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        zoomTransformRef.current = event.transform
        zoomLayer.attr('transform', event.transform.toString())

        const nextZoom = event.transform.k
        setZoomLevel((current) =>
          Math.abs(current - nextZoom) > 0.005 ? nextZoom : current,
        )

        labelSelection.attr('display', nextZoom > 1.5 ? null : 'none')
      })

    zoomBehaviorRef.current = zoomBehavior

    svg.call(zoomBehavior)
    svg.on('dblclick.zoom', null)

    svg.on('dblclick', (event) => {
      event.preventDefault()
      svg.transition().duration(420).call(zoomBehavior.transform, d3.zoomIdentity)
    })

    svg.on('pointermove', (event) => {
      const quadtree = quadtreeRef.current
      const svgNode = svgRef.current

      if (!quadtree || !svgNode) {
        return
      }

      const [pointerX, pointerY] = d3.pointer(event, svgNode)
      const [graphX, graphY] = zoomTransformRef.current.invert([pointerX, pointerY])

      const foundNode = quadtree.find(graphX, graphY, 24) ?? null
      setHoveredNode((previous) => (previous?.id === foundNode?.id ? previous : foundNode))

      if (foundNode) {
        const tooltipX = clamp(pointerX + 12, 8, Math.max(8, viewport.width - 280))
        const tooltipY = clamp(pointerY + 12, 8, Math.max(8, viewport.height - 160))
        setTooltipPosition({ x: tooltipX, y: tooltipY })
      }
    })

    svg.on('pointerleave', () => {
      setHoveredNode(null)
    })

    svg.on('click', (event) => {
      if (event.target === svg.node()) {
        selectNode(null)
      }
      setContextMenu(null)
    })

    applyInteractionStyles()

    return () => {
      simulation.stop()
      svg.on('.zoom', null)
      svg.on('dblclick', null)
      svg.on('pointermove', null)
      svg.on('pointerleave', null)
      svg.on('click', null)
    }
  }, [
    applyInteractionStyles,
    filteredEdges,
    filteredNodes,
    onNodeSelect,
    selectNode,
    viewMode,
    viewport.height,
    viewport.width,
  ])

  useEffect(() => {
    applyInteractionStyles()
  }, [applyInteractionStyles])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeMenu = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  const handleOpenOnGitHub = () => {
    if (!repo || !contextNode) {
      setContextMenu(null)
      return
    }

    const branch = repo.branch || repo.defaultBranch
    const filePath = getNodePath(contextNode)
    const githubUrl = `${repo.url}/blob/${branch}/${filePath}`

    window.open(githubUrl, '_blank', 'noopener,noreferrer')
    setContextMenu(null)
  }

  const handleCopyPath = async () => {
    if (!contextNode) {
      setContextMenu(null)
      return
    }

    try {
      await navigator.clipboard.writeText(getNodePath(contextNode))
    } catch {
      // Best effort clipboard write; ignore failure in restricted environments.
    }

    setContextMenu(null)
  }

  const handleTogglePin = () => {
    if (!contextNode) {
      setContextMenu(null)
      return
    }

    const simNode = nodeMapRef.current.get(contextNode.id)
    if (!simNode) {
      setContextMenu(null)
      return
    }

    if (pinnedNodeIdsRef.current.has(simNode.id)) {
      pinnedNodeIdsRef.current.delete(simNode.id)
      simNode.fx = undefined
      simNode.fy = undefined
    } else {
      pinnedNodeIdsRef.current.add(simNode.id)
      simNode.fx = simNode.x ?? viewport.width / 2
      simNode.fy = simNode.y ?? viewport.height / 2
    }

    simulationRef.current?.alpha(0.18).restart()
    setContextMenu(null)
  }

  return (
    <section className="graph-canvas" aria-label="Dependency graph canvas">
      <div className="graph-canvas-viewport" ref={containerRef}>
        <svg ref={svgRef} className="graph-canvas-svg" />

        <div className="graph-canvas-hud">
          <span>Nodes: {filteredNodes.length}</span>
          <span>Links: {filteredEdges.length}</span>
          <span>Zoom: {zoomLevel.toFixed(2)}x</span>
          <span>Mode: {viewMode}</span>
        </div>

        <GraphControls
          zoomLevel={zoomLevel}
          viewMode={viewMode}
          showOrphans={showOrphans}
          detectedLanguages={detectedLanguages}
          hiddenLanguages={hiddenLanguages}
          searchQuery={searchQuery}
          onZoomIn={() => handleZoomDelta(1.2)}
          onZoomOut={() => handleZoomDelta(1 / 1.2)}
          onFitAll={handleFitAll}
          onResetLayout={handleResetLayout}
          onViewModeChange={setViewMode}
          onToggleOrphans={() => setShowOrphans((value) => !value)}
          onToggleLanguage={toggleLanguage}
          onSearchChange={setSearchQuery}
          onPinAll={handlePinAll}
          onReleaseAll={handleReleaseAll}
        />

        <MiniMap
          nodesRef={simulationNodesRef}
          zoomTransformRef={zoomTransformRef}
          viewportWidth={viewport.width}
          viewportHeight={viewport.height}
          onPanToCenter={panToCenter}
        />

        {hoveredNode ? (
          <div
            className="graph-tooltip-anchor"
            style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
          >
            <NodeTooltip node={hoveredNode} visible />
          </div>
        ) : null}

        {contextMenu ? (
          <div
            className="graph-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={handleOpenOnGitHub}>
              Open on GitHub
            </button>
            <button type="button" onClick={handleCopyPath}>
              Copy path
            </button>
            <button type="button" onClick={handleTogglePin}>
              {contextNode && pinnedNodeIdsRef.current.has(contextNode.id)
                ? 'Unpin'
                : 'Pin'}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
