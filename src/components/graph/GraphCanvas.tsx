import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  GraphControls,
  type OwnershipLegendItem,
} from '@/components/graph/GraphControls'
import { MiniMap } from '@/components/graph/MiniMap'
import { NodeTooltip } from '@/components/graph/NodeTooltip'
import { calculateBlastRadius } from '@/lib/graph/blastRadius'
import { useAppStore } from '@/store/useAppStore'
import { contributorColorFromLogin, normalizePathKey } from '@/utils/ownershipUtils'
import { runLayoutEngine } from '@/lib/graph/layoutEngine'
import { darkenHex, languageToColor, withAlpha, withSaturation } from '@/utils/colorUtils'
import type { FileContributors, GraphEdge, GraphNode } from '@/types'

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

function getTopContributorLogin(entry: FileContributors | undefined): string | null {
  if (!entry || entry.contributors.length === 0) {
    return null
  }

  const [top] = [...entry.contributors].sort((left, right) => {
    if (right.commits !== left.commits) {
      return right.commits - left.commits
    }

    return left.login.localeCompare(right.login)
  })

  return top?.login ?? null
}

function defaultNodeRadius(node: GraphNode): number {
  return Math.max(6, Math.min(20, Math.log((node.size ?? 0) + 1) * 3))
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

function edgeIdFromNodes(sourceId: string, targetId: string): string {
  return `${sourceId}::${targetId}`
}

function colorForBlastDistance(distance: number): string {
  if (distance <= 1) {
    return '#E24B4A'
  }
  if (distance === 2) {
    return '#EF9F27'
  }
  if (distance === 3) {
    return '#FAC775'
  }
  return '#F9ECAA'
}

function nodeColorByOverlay(
  node: GraphNode,
  overlay: ReturnType<typeof useAppStore.getState>['graphOverlay'],
  context: {
    ageExtent: [number, number]
    ownershipColorByContributor: Map<string, string>
    topContributorByNodeId: Map<string, string>
    testablePaths: Set<string>
  },
): string {
  if (overlay === 'blast') {
    return d3.interpolateTurbo(normalizeBlastScore(node.blastScore))
  }

  if (overlay === 'size') {
    const size = Math.max(0, node.size ?? 0)
    const scale = d3.scaleLinear<string>().domain([0, 2000]).range(['#94a3b8', '#ef4444']).clamp(true)
    return scale(size)
  }

  if (overlay === 'age') {
    const [minAge, maxAge] = context.ageExtent
    const current = new Date(node.lastModified ?? 0).getTime()
    if (!Number.isFinite(current) || minAge === maxAge) {
      return '#94a3b8'
    }

    const ageScale = d3
      .scaleLinear<string>()
      .domain([minAge, maxAge])
      .range(['#94a3b8', '#f8fafc'])
      .clamp(true)
    return ageScale(current)
  }

  if (overlay === 'tests') {
    const hasTest = hasTestCoverage(node, context.testablePaths)
    const large = (node.lineCount ?? 0) > 250 || (node.size ?? 0) > 12000
    if (hasTest) {
      return '#1FA46E'
    }
    if (large) {
      return '#E24B4A'
    }
    return '#EF9F27'
  }

  if (overlay === 'ownership') {
    const owner = context.topContributorByNodeId.get(node.id)
    if (!owner) {
      return '#90a3b8'
    }

    return context.ownershipColorByContributor.get(owner) ?? contributorColorFromLogin(owner)
  }

  return languageToColor(node.language || node.extension)
}

function hasTestCoverage(node: GraphNode, testablePaths: Set<string>): boolean {
  const normalizedPath = getNodePath(node).replace(/\\/g, '/')
  const base = normalizedPath.replace(/\.[^.]+$/, '')
  const fileName = normalizedPath.split('/').pop() ?? normalizedPath
  const fileBase = fileName.replace(/\.[^.]+$/, '')

  return [...testablePaths].some((candidate) => {
    return (
      candidate.includes(`${base}.test.`) ||
      candidate.includes(`${base}.spec.`) ||
      candidate.includes(`/${fileBase}.test.`) ||
      candidate.includes(`/${fileBase}.spec.`) ||
      candidate.includes(`/__tests__/${fileName}`) ||
      candidate.includes(`/tests/${fileName}`)
    )
  })
}

function clusterHullPath(nodes: SimulationNode[]): string | null {
  const points = nodes
    .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
    .map((node) => [node.x ?? 0, node.y ?? 0] as [number, number])

  if (points.length < 3) {
    return null
  }

  const hull = d3.polygonHull(points)
  if (!hull) {
    return null
  }

  return `M${hull.map(([x, y]) => `${x},${y}`).join('L')}Z`
}

export function GraphCanvas({ nodes, edges, onNodeSelect }: GraphCanvasProps) {
  const selectNode = useAppStore((state) => state.selectNode)
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const repo = useAppStore((state) => state.analysisResult?.repo ?? null)
  const analysisFiles = useAppStore((state) => state.analysisResult?.files ?? [])
  const contributorsByFile = useAppStore(
    (state) => state.analysisResult?.contributors ?? null,
  )
  const layoutMode = useAppStore((state) => state.graphLayout)
  const overlayMode = useAppStore((state) => state.graphOverlay)
  const setLayoutMode = useAppStore((state) => state.setGraphLayout)
  const setOverlayMode = useAppStore((state) => state.setGraphOverlay)

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

  const contributorsByPath = useMemo(() => {
    if (!contributorsByFile || contributorsByFile.size === 0) {
      return null
    }

    const map = new Map<string, FileContributors>()
    for (const [key, value] of contributorsByFile.entries()) {
      map.set(normalizePathKey(key), value)
      map.set(normalizePathKey(value.filePath), value)
    }

    return map
  }, [contributorsByFile])

  const topContributorByNodeId = useMemo(() => {
    const map = new Map<string, string>()
    if (!contributorsByPath) {
      return map
    }

    for (const node of filteredNodes) {
      const normalizedPath = normalizePathKey(getNodePath(node))
      const entry =
        contributorsByPath.get(normalizedPath) ??
        contributorsByPath.get(normalizePathKey(node.id))

      const topContributor = getTopContributorLogin(entry)
      if (topContributor) {
        map.set(node.id, topContributor)
      }
    }

    return map
  }, [contributorsByPath, filteredNodes])

  const ownershipColorByContributor = useMemo(() => {
    const map = new Map<string, string>()
    for (const login of new Set(topContributorByNodeId.values())) {
      map.set(login, contributorColorFromLogin(login))
    }
    return map
  }, [topContributorByNodeId])

  const ownershipLegend = useMemo<OwnershipLegendItem[]>(() => {
    const countsByLogin = new Map<string, number>()

    for (const login of topContributorByNodeId.values()) {
      countsByLogin.set(login, (countsByLogin.get(login) ?? 0) + 1)
    }

    return [...countsByLogin.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1]
        }
        return left[0].localeCompare(right[0])
      })
      .map(([login, files]) => ({
        login,
        files,
        color: ownershipColorByContributor.get(login) ?? contributorColorFromLogin(login),
      }))
  }, [ownershipColorByContributor, topContributorByNodeId])

  const testablePaths = useMemo(
    () => new Set(analysisFiles.map((file) => file.path.replace(/\\/g, '/').toLowerCase())),
    [analysisFiles],
  )

  const ageExtent = useMemo<[number, number]>(() => {
    const values = filteredNodes
      .map((node) => new Date(node.lastModified ?? 0).getTime())
      .filter(Number.isFinite)

    return [d3.min(values) ?? 0, d3.max(values) ?? 0]
  }, [filteredNodes])

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

  const blastResult = useMemo(() => {
    if (!selectedNodeId || filteredNodes.length === 0) {
      return null
    }

    if (!filteredNodes.some((node) => node.id === selectedNodeId)) {
      return null
    }

    return calculateBlastRadius(
      selectedNodeId,
      {
        nodes: filteredNodes,
        links: filteredEdges,
        edges: filteredEdges,
      },
      4,
    )
  }, [filteredEdges, filteredNodes, selectedNodeId])

  const blastDistanceByNodeId = useMemo(() => {
    const distances = new Map<string, number>()
    if (!blastResult) {
      return distances
    }

    distances.set(blastResult.seedNodeId, 0)

    for (const affectedNode of blastResult.affected.values()) {
      const candidateDistances = [
        affectedNode.dependentDistance,
        affectedNode.dependencyDistance,
      ].filter((value): value is number => Number.isFinite(value))

      if (candidateDistances.length === 0) {
        continue
      }

      distances.set(affectedNode.nodeId, Math.min(...candidateDistances))
    }

    return distances
  }, [blastResult])

  const relevantEdgeIds = useMemo(
    () => new Set(blastResult?.impactedEdgeIds ?? []),
    [blastResult],
  )

  const applyInteractionStyles = useCallback(() => {
    const hoveredId = hoveredNode?.id ?? null
    const searching = normalizedSearch.length > 0
    const hasBlastSelection = Boolean(selectedNodeId && blastResult)

    const baseNodeColor = (nodeDatum: SimulationNode): string => {
      return nodeColorByOverlay(nodeDatum, overlayMode, {
        ageExtent,
        ownershipColorByContributor,
        topContributorByNodeId,
        testablePaths,
      })
    }

    const baseNodeRadius = (nodeDatum: SimulationNode): number => defaultNodeRadius(nodeDatum)

    const baseLinkColor = (linkDatum: SimulationLink): string => {
      const source =
        typeof linkDatum.source === 'string'
          ? nodeMapRef.current.get(linkDatum.source)
          : linkDatum.source
      const sourceColor = source ? baseNodeColor(source) : '#7c8e9f'
      return withSaturation(sourceColor, 0.6)
    }

    nodeSelectionRef.current
      ?.attr('r', (nodeDatum) => {
        const baseRadius = baseNodeRadius(nodeDatum)
        if (hasBlastSelection && nodeDatum.id === selectedNodeId) {
          return baseRadius * 1.3
        }
        return baseRadius
      })
      .attr('fill', (nodeDatum) => {
        if (hasBlastSelection) {
          if (nodeDatum.id === selectedNodeId) {
            return '#ffffff'
          }

          const impactDistance = blastDistanceByNodeId.get(nodeDatum.id)
          if (typeof impactDistance === 'number' && impactDistance > 0) {
            return colorForBlastDistance(impactDistance)
          }
        }

        return baseNodeColor(nodeDatum)
      })
      .attr('stroke', (nodeDatum) => {
        if (hasBlastSelection) {
          if (nodeDatum.id === selectedNodeId) {
            return '#8FF7FF'
          }

          const impactDistance = blastDistanceByNodeId.get(nodeDatum.id)
          if (typeof impactDistance === 'number' && impactDistance > 0) {
            return darkenHex(colorForBlastDistance(impactDistance), 0.22)
          }
        }

        return darkenHex(baseNodeColor(nodeDatum), 0.24)
      })
      .attr('stroke-width', (nodeDatum) => {
        if (hasBlastSelection && nodeDatum.id === selectedNodeId) {
          return 4.2
        }

        if (nodeDatum.id === hoveredId) {
          return 3
        }

        return 2
      })
      .attr('opacity', (nodeDatum) => {
        if (hasBlastSelection) {
          if (nodeDatum.id === selectedNodeId) {
            return 1
          }

          const impactDistance = blastDistanceByNodeId.get(nodeDatum.id)
          if (typeof impactDistance === 'number' && impactDistance > 0) {
            return 1
          }

          return 0.08
        }

        if (!searching) {
          return 1
        }

        return matchingNodeIds.has(nodeDatum.id) ? 1 : 0.16
      })
      .attr('stroke-opacity', (nodeDatum) => {
        if (hasBlastSelection) {
          if (nodeDatum.id === selectedNodeId) {
            return 1
          }

          const impactDistance = blastDistanceByNodeId.get(nodeDatum.id)
          return typeof impactDistance === 'number' && impactDistance > 0 ? 0.95 : 0.1
        }

        if (nodeDatum.id === selectedNodeId || nodeDatum.id === hoveredId) {
          return 1
        }

        if (searching && matchingNodeIds.has(nodeDatum.id)) {
          return 0.85
        }

        return 0
      })

    linkSelectionRef.current
      ?.classed('is-affected-link', (linkDatum) => {
        if (!hasBlastSelection) {
          return false
        }

        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        return relevantEdgeIds.has(edgeIdFromNodes(source, target))
      })
      .attr('display', (linkDatum) => {
        if (!hasBlastSelection) {
          return null
        }

        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        const relevant = relevantEdgeIds.has(edgeIdFromNodes(source, target))
        return relevant ? null : 'none'
      })
      .attr('stroke-dasharray', (linkDatum) => {
        if (!hasBlastSelection) {
          return null
        }

        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        const relevant = relevantEdgeIds.has(edgeIdFromNodes(source, target))
        return relevant ? '7 4' : null
      })
      .attr('stroke-opacity', (linkDatum) => {
        if (hasBlastSelection) {
          const source = sourceNodeId(linkDatum)
          const target = targetNodeId(linkDatum)
          const relevant = relevantEdgeIds.has(edgeIdFromNodes(source, target))
          return relevant ? 0.95 : 0
        }

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
      .attr('stroke-width', (linkDatum) => {
        if (!hasBlastSelection) {
          return clamp(linkDatum.weight ?? 1, 1, 4)
        }

        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        const relevant = relevantEdgeIds.has(edgeIdFromNodes(source, target))
        return relevant ? clamp((linkDatum.weight ?? 1) + 1, 1.5, 5) : 0
      })
      .attr('stroke', (linkDatum) => {
        if (!hasBlastSelection) {
          return baseLinkColor(linkDatum)
        }

        const source = sourceNodeId(linkDatum)
        const target = targetNodeId(linkDatum)
        const relevant = relevantEdgeIds.has(edgeIdFromNodes(source, target))

        if (!relevant) {
          return baseLinkColor(linkDatum)
        }

        if (source === selectedNodeId || target === selectedNodeId) {
          return '#FFFFFF'
        }

        const sourceDistance = blastDistanceByNodeId.get(source)
        const targetDistance = blastDistanceByNodeId.get(target)
        const candidateDistances = [sourceDistance, targetDistance].filter(
          (value): value is number => typeof value === 'number' && value > 0,
        )

        if (candidateDistances.length > 0) {
          return colorForBlastDistance(Math.min(...candidateDistances))
        }

        return baseLinkColor(linkDatum)
      })

    labelSelectionRef.current?.attr('opacity', (nodeDatum) => {
      if (hasBlastSelection) {
        if (nodeDatum.id === selectedNodeId) {
          return 1
        }

        const impactDistance = blastDistanceByNodeId.get(nodeDatum.id)
        return typeof impactDistance === 'number' && impactDistance > 0 ? 1 : 0.08
      }

      if (!searching) {
        return 1
      }

      return matchingNodeIds.has(nodeDatum.id) ? 1 : 0.2
    })
  }, [
    blastDistanceByNodeId,
    blastResult,
    hoveredNode?.id,
    matchingNodeIds,
    normalizedSearch,
    ownershipColorByContributor,
    relevantEdgeIds,
    selectedNodeId,
    topContributorByNodeId,
    overlayMode,
    ageExtent,
    testablePaths,
  ])

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
    if (layoutMode !== 'force') {
      setLayoutMode(layoutMode)
      return
    }

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
  }, [layoutMode, setLayoutMode, viewport.height, viewport.width])

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
    const clusterLayer = zoomLayer.append('g').attr('class', 'graph-cluster-layer')
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
      .attr('cx', (datum) => datum.x ?? 0)
      .attr('cy', (datum) => datum.y ?? 0)

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
      .attr('x', (datum) => datum.x ?? 0)
      .attr('y', (datum) => (datum.y ?? 0) + defaultNodeRadius(datum) + 4)

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
      nodeColorByOverlay(nodeDatum, overlayMode, {
        ageExtent,
        ownershipColorByContributor,
        topContributorByNodeId,
        testablePaths,
      })

    const radiusForNode = (nodeDatum: SimulationNode): number => defaultNodeRadius(nodeDatum)

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

    const laidOutGraph = runLayoutEngine(
      {
        nodes: simulationNodes,
        links: simulationLinks.map((link) => ({
          source: sourceNodeId(link),
          target: targetNodeId(link),
          type: link.type,
          weight: link.weight,
        })),
        edges: simulationLinks.map((link) => ({
          source: sourceNodeId(link),
          target: targetNodeId(link),
          type: link.type,
          weight: link.weight,
        })),
      },
      {
        width: viewport.width,
        height: viewport.height,
        mode: layoutMode,
      },
    )

    const targetById = new Map(laidOutGraph.nodes.map((node) => [node.id, node]))
    if (layoutMode !== 'force') {
      simulation.stop()
      simulationNodes.forEach((node) => {
        const target = targetById.get(node.id)
        node.x = target?.x ?? node.x
        node.y = target?.y ?? node.y
      })

      nodeSelection
        .transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('cx', (datum) => datum.x ?? 0)
        .attr('cy', (datum) => datum.y ?? 0)

      labelSelection
        .transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('x', (datum) => datum.x ?? 0)
        .attr('y', (datum) => (datum.y ?? 0) + radiusForNode(datum) + 4)

      linkSelection
        .transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('x1', (datum) => (typeof datum.source === 'string' ? 0 : (datum.source.x ?? 0)))
        .attr('y1', (datum) => (typeof datum.source === 'string' ? 0 : (datum.source.y ?? 0)))
        .attr('x2', (datum) => (typeof datum.target === 'string' ? 0 : (datum.target.x ?? 0)))
        .attr('y2', (datum) => (typeof datum.target === 'string' ? 0 : (datum.target.y ?? 0)))

      if (layoutMode === 'cluster') {
        const groups = d3.group(simulationNodes, (node) => node.group || 'root')
        const hulls = [...groups.entries()]
          .map(([group, groupNodes]) => ({
            group,
            path: clusterHullPath(groupNodes),
            x: d3.mean(groupNodes, (node) => node.x ?? 0) ?? 0,
            y: d3.mean(groupNodes, (node) => node.y ?? 0) ?? 0,
          }))
          .filter((entry) => entry.path)

        clusterLayer
          .selectAll<SVGPathElement, (typeof hulls)[number]>('path')
          .data(hulls, (datum) => datum.group)
          .join('path')
          .attr('class', 'graph-cluster-hull')
          .attr('fill', '#1dc2dd')
          .attr('fill-opacity', 0.08)
          .attr('stroke', withAlpha('#1dc2dd', 0.35))
          .attr('stroke-width', 1.5)
          .transition()
          .duration(600)
          .ease(d3.easeCubicInOut)
          .attr('d', (datum) => datum.path ?? '')

        clusterLayer
          .selectAll<SVGTextElement, (typeof hulls)[number]>('text')
          .data(hulls, (datum) => `label:${datum.group}`)
          .join('text')
          .attr('class', 'graph-cluster-label')
          .attr('fill', 'var(--cl-muted)')
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .text((datum) => datum.group)
          .transition()
          .duration(600)
          .ease(d3.easeCubicInOut)
          .attr('x', (datum) => datum.x)
          .attr('y', (datum) => datum.y)
      } else {
        clusterLayer.selectAll('*').remove()
      }
    } else {
      clusterLayer.selectAll('*').remove()
      simulation.alpha(1).restart()
    }

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
    ownershipColorByContributor,
    selectNode,
    topContributorByNodeId,
    layoutMode,
    overlayMode,
    ageExtent,
    testablePaths,
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

  useEffect(() => {
    const fitGraph = () => handleFitAll()
    window.addEventListener('codelens:fit-graph', fitGraph)
    return () => window.removeEventListener('codelens:fit-graph', fitGraph)
  }, [handleFitAll])

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
          <span>Layout: {layoutMode}</span>
          <span>Color: {overlayMode}</span>
        </div>

        <GraphControls
          zoomLevel={zoomLevel}
          layoutMode={layoutMode}
          overlayMode={overlayMode}
          showOrphans={showOrphans}
          detectedLanguages={detectedLanguages}
          hiddenLanguages={hiddenLanguages}
          searchQuery={searchQuery}
          ownershipLegend={ownershipLegend}
          onZoomIn={() => handleZoomDelta(1.2)}
          onZoomOut={() => handleZoomDelta(1 / 1.2)}
          onFitAll={handleFitAll}
          onResetLayout={handleResetLayout}
          onLayoutModeChange={setLayoutMode}
          onOverlayModeChange={setOverlayMode}
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
