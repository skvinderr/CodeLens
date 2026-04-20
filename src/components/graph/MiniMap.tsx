import { useEffect, useRef } from 'react'
import type { MutableRefObject, PointerEventHandler } from 'react'
import * as d3 from 'd3'
import { languageToColor } from '@/utils/colorUtils'
import type { GraphNode } from '@/types'

const MINIMAP_WIDTH = 140
const MINIMAP_HEIGHT = 100
const MINIMAP_PADDING = 6

interface MiniMapScales {
  xScale: d3.ScaleLinear<number, number>
  yScale: d3.ScaleLinear<number, number>
  worldWidth: number
  worldHeight: number
  viewportRectWidth: number
  viewportRectHeight: number
}

export interface MiniMapProps {
  nodesRef: MutableRefObject<GraphNode[]>
  zoomTransformRef: MutableRefObject<d3.ZoomTransform>
  viewportWidth: number
  viewportHeight: number
  onPanToCenter: (center: { x: number; y: number }) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function MiniMap({
  nodesRef,
  zoomTransformRef,
  viewportWidth,
  viewportHeight,
  onPanToCenter,
}: MiniMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const scalesRef = useRef<MiniMapScales | null>(null)
  const rectRef = useRef<SVGRectElement | null>(null)

  const dragRef = useRef({
    active: false,
    offsetX: 0,
    offsetY: 0,
  })

  useEffect(() => {
    const svgNode = svgRef.current
    if (!svgNode) {
      return
    }

    const svg = d3
      .select(svgNode)
      .attr('viewBox', `0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`)

    svg.selectAll('*').remove()

    const nodeLayer = svg.append('g').attr('class', 'mini-map-node-layer')
    const viewportLayer = svg.append('g').attr('class', 'mini-map-viewport-layer')

    viewportLayer
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 0)
      .attr('height', 0)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('class', 'mini-map-viewport-rect')
      .style('cursor', 'grab')
      .each(function assignRectRef() {
        rectRef.current = this as SVGRectElement
      })

    const render = () => {
      const nodes = nodesRef.current.filter(
        (node): node is GraphNode & { x: number; y: number } =>
          Number.isFinite(node.x) && Number.isFinite(node.y),
      )

      const hasNodes = nodes.length > 0
      const minX = hasNodes ? d3.min(nodes, (node) => node.x) ?? 0 : -50
      const maxX = hasNodes ? d3.max(nodes, (node) => node.x) ?? 100 : 100
      const minY = hasNodes ? d3.min(nodes, (node) => node.y) ?? 0 : -50
      const maxY = hasNodes ? d3.max(nodes, (node) => node.y) ?? 100 : 100

      const boundedMinX = minX - 32
      const boundedMaxX = maxX + 32
      const boundedMinY = minY - 24
      const boundedMaxY = maxY + 24

      const xScale = d3
        .scaleLinear()
        .domain([boundedMinX, boundedMaxX])
        .range([MINIMAP_PADDING, MINIMAP_WIDTH - MINIMAP_PADDING])

      const yScale = d3
        .scaleLinear()
        .domain([boundedMinY, boundedMaxY])
        .range([MINIMAP_PADDING, MINIMAP_HEIGHT - MINIMAP_PADDING])

      nodeLayer
        .selectAll<SVGCircleElement, GraphNode & { x: number; y: number }>('circle')
        .data(nodes, (node) => node.id)
        .join('circle')
        .attr('r', 2)
        .attr('cx', (node) => xScale(node.x))
        .attr('cy', (node) => yScale(node.y))
        .attr('fill', (node) => languageToColor(node.language || node.extension))
        .attr('opacity', 0.95)

      const transform = zoomTransformRef.current
      const worldWidth = Math.max(1, viewportWidth / Math.max(0.1, transform.k))
      const worldHeight = Math.max(1, viewportHeight / Math.max(0.1, transform.k))
      const worldLeft = -transform.x / Math.max(0.1, transform.k)
      const worldTop = -transform.y / Math.max(0.1, transform.k)

      const viewportX = xScale(worldLeft)
      const viewportY = yScale(worldTop)
      const viewportRectWidth = Math.max(
        8,
        xScale(worldLeft + worldWidth) - viewportX,
      )
      const viewportRectHeight = Math.max(
        8,
        yScale(worldTop + worldHeight) - viewportY,
      )

      viewportLayer
        .selectAll<SVGRectElement, undefined>('rect')
        .attr('x', viewportX)
        .attr('y', viewportY)
        .attr('width', viewportRectWidth)
        .attr('height', viewportRectHeight)

      scalesRef.current = {
        xScale,
        yScale,
        worldWidth,
        worldHeight,
        viewportRectWidth,
        viewportRectHeight,
      }

      rafRef.current = window.requestAnimationFrame(render)
    }

    rafRef.current = window.requestAnimationFrame(render)

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [nodesRef, onPanToCenter, viewportHeight, viewportWidth, zoomTransformRef])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.active || !svgRef.current || !scalesRef.current) {
        return
      }

      const svgRect = svgRef.current.getBoundingClientRect()
      const localX = event.clientX - svgRect.left
      const localY = event.clientY - svgRect.top

      const nextRectX = clamp(
        localX - dragRef.current.offsetX,
        MINIMAP_PADDING,
        MINIMAP_WIDTH - MINIMAP_PADDING - scalesRef.current.viewportRectWidth,
      )
      const nextRectY = clamp(
        localY - dragRef.current.offsetY,
        MINIMAP_PADDING,
        MINIMAP_HEIGHT - MINIMAP_PADDING - scalesRef.current.viewportRectHeight,
      )

      const worldLeft = scalesRef.current.xScale.invert(nextRectX)
      const worldTop = scalesRef.current.yScale.invert(nextRectY)

      onPanToCenter({
        x: worldLeft + scalesRef.current.worldWidth / 2,
        y: worldTop + scalesRef.current.worldHeight / 2,
      })
    }

    const handlePointerUp = () => {
      dragRef.current.active = false
      if (rectRef.current) {
        rectRef.current.style.cursor = 'grab'
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [onPanToCenter])

  const handlePointerDown: PointerEventHandler<SVGSVGElement> = (event) => {
    const target = event.target as SVGElement
    if (!target.classList.contains('mini-map-viewport-rect') || !scalesRef.current) {
      return
    }

    event.preventDefault()

    const svgRect = event.currentTarget.getBoundingClientRect()
    const localX = event.clientX - svgRect.left
    const localY = event.clientY - svgRect.top
    const rectX = Number(target.getAttribute('x') ?? 0)
    const rectY = Number(target.getAttribute('y') ?? 0)

    dragRef.current.active = true
    dragRef.current.offsetX = localX - rectX
    dragRef.current.offsetY = localY - rectY

    if (rectRef.current) {
      rectRef.current.style.cursor = 'grabbing'
    }
  }

  return (
    <div className="mini-map mini-map-floating" aria-label="Graph minimap">
      <svg
        ref={svgRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="mini-map-svg"
        onPointerDown={handlePointerDown}
      />
    </div>
  )
}
