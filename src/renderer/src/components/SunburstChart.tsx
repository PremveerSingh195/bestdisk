import { useCallback, useEffect, useMemo, useRef } from 'react'
import { arc as d3Arc, easeCubicOut, hierarchy, interpolateNumber, partition, select } from 'd3'
import type { HierarchyRectangularNode } from 'd3'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import type { DiskNode } from '@shared/types'
import { useElementSize } from '@renderer/hooks/useElementSize'
import { currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { colorFor } from '@renderer/utils/colorScale'
import { formatBytes, formatCount } from '@renderer/utils/formatBytes'
import { Button } from './Primitives'
import { ColorLegend } from './ColorLegend'

/** Arcs narrower than 0.3° are skipped: too small to see or click. */
const MIN_ARC_RADIANS = (0.3 * Math.PI) / 180
const MIN_LABEL_THICKNESS = 14
const MIN_LABEL_ARC_LENGTH = 40
const DURATION = 300

interface ArcShape {
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
}

type PartitionNode = HierarchyRectangularNode<DiskNode> & {
  branchIndex?: number
}

const arcGen = d3Arc<ArcShape>()

function buildLayout(node: DiskNode, radius: number): PartitionNode {
  const root = hierarchy<DiskNode>(node, (child) => child.children)
    // Only leaves contribute value: directory sizes are already rolled up, so
    // summing at every level would double-count every byte.
    .sum((datum) => (datum.children && datum.children.length > 0 ? 0 : datum.size))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const partitionRoot = partition<DiskNode>().size([2 * Math.PI, Math.max(1, radius)])(root) as PartitionNode

  // Track branch index to assign distinct vibrant palettes per folder sector
  partitionRoot.each((d: any) => {
    if (d.depth === 0) {
      d.branchIndex = 0
    } else if (d.depth === 1) {
      d.branchIndex = partitionRoot.children?.indexOf(d) ?? 0
    } else {
      d.branchIndex = d.parent?.branchIndex ?? 0
    }
  })

  return partitionRoot
}

function countLeaves(node: DiskNode, counts: Map<string, number>): number {
  if (!node.children || node.children.length === 0) return 1
  let total = 0
  for (const child of node.children) total += countLeaves(child, counts)
  counts.set(node.id, total)
  return total
}


export function SunburstChart(): JSX.Element | null {
  const node = useScanStore(currentDirectory)
  const colorMode = useScanStore((state) => state.colorMode)
  const canGoBack = useScanStore((state) => state.pathStack.length > 1)
  const zoomOut = useScanStore((state) => state.zoomOut)
  const drillInto = useScanStore((state) => state.drillInto)
  const toggleSelection = useSelectionStore((state) => state.toggle)
  const openContextMenu = useUiStore((state) => state.openContextMenu)
  const setHovered = useUiStore((state) => state.setHovered)

  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  /** Angles from the previous layout, so drill-downs animate instead of jump. */
  const previousShapes = useRef<Map<string, ArcShape>>(new Map())

  const leafCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (node) countLeaves(node, counts)
    return counts
  }, [node])

  const activate = useCallback(
    (target: DiskNode): void => {
      if (target.type === 'directory' && target.children && target.children.length > 0) {
        drillInto(target)
        return
      }
      toggleSelection(target)
    },
    [drillInto, toggleSelection]
  )

  const layout = useMemo(() => {
    if (!node || width <= 0 || height <= 0) return null
    const radius = Math.max(1, Math.min(width, height) / 2 - 12)
    const discRadius = Math.max(24, radius * 0.26)
    const layoutRoot = buildLayout(node, Math.max(24, radius - discRadius))
    return { radius, discRadius, layoutRoot }
  }, [node, width, height])

  useEffect(() => {
    const svgElement = svgRef.current
    if (!svgElement || !layout || !node || width <= 0 || height <= 0) return

    const { discRadius, layoutRoot } = layout

    // partition() gives the root its own innermost ring; dropping that ring and
    // shifting the rest inwards keeps the visible arcs flush with the disc.
    const yShift = layoutRoot.y1
    const ringY = (y: number): number => discRadius + y - yShift

    const shapeOf = (datum: PartitionNode): ArcShape => ({
      innerRadius: ringY(datum.y0),
      outerRadius: ringY(datum.y1),
      startAngle: datum.x0,
      endAngle: datum.x1
    })

    const midRadius = (datum: PartitionNode): number =>
      (ringY(datum.y0) + ringY(datum.y1)) / 2

    const svg = select(svgElement)
    const chart = svg
      .selectAll<SVGGElement, null>('g.chart-root')
      .data([null])
      .join('g')
      .attr('class', 'chart-root')
      .attr('transform', `translate(${width / 2}, ${height / 2})`)

    // Explicit layers keep arcs under labels under the centre text, regardless
    // of the order D3 happens to append new elements in.
    const arcsLayer = chart
      .selectAll<SVGGElement, null>('g.layer-arcs')
      .data([null])
      .join('g')
      .attr('class', 'layer-arcs')
    const labelsLayer = chart
      .selectAll<SVGGElement, null>('g.layer-labels')
      .data([null])
      .join('g')
      .attr('class', 'layer-labels')
    const centreLayer = chart
      .selectAll<SVGGElement, null>('g.layer-centre')
      .data([null])
      .join('g')
      .attr('class', 'layer-centre')

    const visible = layoutRoot
      .descendants()
      .slice(1)
      .filter((datum) => datum.x1 - datum.x0 >= MIN_ARC_RADIANS && datum.y1 > datum.y0)

    // ---------------------------------------------------------------- arcs
    const paths = arcsLayer
      .selectAll<SVGPathElement, PartitionNode>('path.chart-segment')
      .data(visible, (datum) => datum.data.id)

    paths.exit().transition().duration(DURATION / 2).attr('opacity', 0).remove()

    const enter = paths
      .enter()
      .append('path')
      .attr('class', 'chart-segment')
      .attr('opacity', 0)
      .attr('d', (datum) => arcGen(previousShapes.current.get(datum.data.id) ?? shapeOf(datum)))

    enter
      .merge(paths)
      .attr('fill', (datum) =>
        colorFor(
          datum.data.size,
          colorMode,
          datum.data.modifiedAt,
          datum.data.category,
          datum.branchIndex ?? 0
        )
      )
      .attr('fill-opacity', (datum) => {
        if (colorMode === 'folder') {
          return Math.max(0.72, 1 - (datum.depth - 1) * 0.08)
        }
        return datum.children ? 0.88 : 1
      })
      .attr('stroke', 'var(--bg-canvas)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (_event, datum) => activate(datum.data))
      .on('contextmenu', (event: MouseEvent, datum) => {
        event.preventDefault()
        openContextMenu(event.clientX, event.clientY, datum.data)
      })
      .on('mouseenter', function (_event, datum) {
        select(this)
          .attr('stroke', 'rgba(255, 255, 255, 0.95)')
          .attr('stroke-width', 2.5)
          .raise()
        setHovered(datum.data)
      })
      .on('mouseleave', function () {
        select(this)
          .attr('stroke', 'var(--bg-canvas)')
          .attr('stroke-width', 1.5)
        setHovered(null)
      })
      .transition()
      .duration(DURATION)
      .ease(easeCubicOut)
      .attr('opacity', 1)
      .attrTween('d', (datum) => {
        const from = previousShapes.current.get(datum.data.id) ?? shapeOf(datum)
        const to = shapeOf(datum)
        const inner = interpolateNumber(from.innerRadius, to.innerRadius)
        const outer = interpolateNumber(from.outerRadius, to.outerRadius)
        const start = interpolateNumber(from.startAngle, to.startAngle)
        const end = interpolateNumber(from.endAngle, to.endAngle)
        return (t) =>
          arcGen({
            innerRadius: inner(t),
            outerRadius: outer(t),
            startAngle: start(t),
            endAngle: end(t)
          }) ?? ''
      })

    // -------------------------------------------------------------- labels
    const labelled = visible.filter((datum) => {
      const arcLength = (datum.x1 - datum.x0) * midRadius(datum)
      return (
        ringY(datum.y1) - ringY(datum.y0) >= MIN_LABEL_THICKNESS &&
        arcLength >= MIN_LABEL_ARC_LENGTH
      )
    })

    const texts = labelsLayer
      .selectAll<SVGTextElement, PartitionNode>('text.arc-label')
      .data(labelled, (datum) => datum.data.id)

    texts.exit().remove()

    texts
      .enter()
      .append('text')
      .attr('class', 'chart-label arc-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.32em')
      .merge(texts)
      .attr('transform', (datum) => {
        const angle = (datum.x0 + datum.x1) / 2
        const r = midRadius(datum)
        const degrees = (angle * 180) / Math.PI - 90
        return `translate(${r * Math.sin(angle)}, ${-r * Math.cos(angle)}) rotate(${degrees})`
      })
      .attr('fill', 'var(--text-primary)')
      .attr('font-size', 10)
      .attr('opacity', 0.92)
      .text((datum) => {
        const arcLength = (datum.x1 - datum.x0) * midRadius(datum)
        const maxChars = Math.max(3, Math.floor(arcLength / 5.6))
        const name = datum.data.name
        const label = name.length > maxChars ? `${name.slice(0, Math.max(1, maxChars - 1))}…` : name

        if (arcLength > 96 && datum.children) {
          const count = leafCounts.get(datum.data.id) ?? 0
          if (count > 1) return `${label} · ${formatCount(count)}`
        }
        return label
      })

    // --------------------------------------------------------- centre disc
    centreLayer
      .selectAll<SVGCircleElement, null>('circle.centre-disc')
      .data([null])
      .join('circle')
      .attr('class', 'centre-disc')
      .attr('r', discRadius)
      .attr('fill', 'var(--bg-canvas)')
      .attr('stroke', 'var(--border)')
      .style('cursor', 'pointer')
      .on('click', () => zoomOut())
      .on('mouseenter', () => setHovered(node))
      .on('mouseleave', () => setHovered(null))

    centreLayer
      .selectAll<SVGTextElement, null>('text.centre-name')
      .data([null])
      .join('text')
      .attr('class', 'chart-label centre-name')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.25em')
      .attr('fill', 'var(--text-primary)')
      .attr('font-size', Math.max(11, Math.min(18, discRadius / 3.2)))
      .attr('font-weight', 600)
      .text(() => shorten(node.name || node.path, 22))

    centreLayer
      .selectAll<SVGTextElement, null>('text.centre-size')
      .data([null])
      .join('text')
      .attr('class', 'chart-label centre-size')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', Math.max(9, Math.min(13, discRadius / 4.5)))
      .text(() => formatBytes(node.size))

    const next = new Map<string, ArcShape>()
    for (const datum of visible) next.set(datum.data.id, shapeOf(datum))
    previousShapes.current = next
  }, [
    node,
    layout,
    colorMode,
    width,
    height,
    leafCounts,
    activate,
    openContextMenu,
    setHovered,
    zoomOut
  ])

  if (!node) return null

  if (!node.children || node.children.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <FolderOpen className="h-8 w-8 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <p className="text-body text-[var(--text-secondary)]">This folder is empty.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg ref={svgRef} width={width} height={height} className="block" />

      <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between">
        <ColorLegend mode={colorMode} />
        <span
          data-selectable
          className="max-w-[45%] truncate font-mono text-label text-[var(--text-tertiary)]"
          title={node.path}
        >
          {node.path}
        </span>
      </div>

      <div className="absolute left-4 top-3">
        <Button size="sm" variant="ghost" icon={ArrowLeft} disabled={!canGoBack} onClick={zoomOut}>
          Back
        </Button>
      </div>
    </div>
  )
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
