import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { easeCubicOut, hierarchy, interpolateNumber, select, treemap } from 'd3'
import type { HierarchyRectangularNode } from 'd3'
import { ArrowLeft, ChevronRight, FolderOpen } from 'lucide-react'
import type { DiskNode } from '@shared/types'
import { useElementSize } from '@renderer/hooks/useElementSize'
import { currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { colorFor, getBranchPalette } from '@renderer/utils/colorScale'
import { formatBytes, formatCount, formatPercent } from '@renderer/utils/formatBytes'
import { Button } from './Primitives'
import { ColorLegend } from './ColorLegend'

const DURATION = 280

type TreemapNode = HierarchyRectangularNode<DiskNode> & {
  branchIndex?: number
}

interface RectShape {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface TooltipState {
  x: number
  y: number
  node: DiskNode
  parentSize: number
}

function shapeOf(datum: TreemapNode): RectShape {
  return { x0: datum.x0, y0: datum.y0, x1: datum.x1, y1: datum.y1 }
}

export function TreemapChart(): JSX.Element | null {
  const node = useScanStore(currentDirectory)
  const colorMode = useScanStore((state) => state.colorMode)
  const pathStack = useScanStore((state) => state.pathStack)
  const canGoBack = pathStack.length > 1
  const zoomOut = useScanStore((state) => state.zoomOut)
  const zoomTo = useScanStore((state) => state.zoomTo)
  const drillInto = useScanStore((state) => state.drillInto)
  const toggleSelection = useSelectionStore((state) => state.toggle)
  const openContextMenu = useUiStore((state) => state.openContextMenu)
  const setHovered = useUiStore((state) => state.setHovered)

  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const previousShapes = useRef<Map<string, RectShape>>(new Map())
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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

  const layoutRoot = useMemo(() => {
    if (!node || width <= 0 || height <= 0) return null

    // ------------------------------------------------------------- Hierarchy
    const root = hierarchy<DiskNode>(node, (child) => child.children)
      .sum((datum) => (datum.children && datum.children.length > 0 ? 0 : datum.size))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    // Assign branch indices to top-level children of the currently viewed root
    root.each((d: any) => {
      if (d.depth === 0) {
        d.branchIndex = 0
      } else if (d.depth === 1) {
        d.branchIndex = root.children?.indexOf(d) ?? 0
      } else {
        d.branchIndex = d.parent?.branchIndex ?? 0
      }
    })

    // ---------------------------------------------------------------- Layout
    const layout = treemap<DiskNode>()
      .size([Math.max(1, width), Math.max(1, height)])
      .paddingTop((d) => {
        // Reserve header bar space for folders with children
        if (d.depth > 0 && d.children && d.children.length > 0) {
          const w = d.x1 - d.x0
          const h = d.y1 - d.y0
          if (w >= 36 && h >= 40) return 20
          if (w >= 24 && h >= 26) return 15
          return 2
        }
        return 0
      })
      .paddingLeft(3)
      .paddingRight(3)
      .paddingBottom(3)
      .paddingInner(2)
      .round(true)

    return layout(root) as TreemapNode
  }, [node, width, height])

  useEffect(() => {
    const svgElement = svgRef.current
    if (!svgElement || !layoutRoot || width <= 0 || height <= 0) return

    const svg = select(svgElement)
    const chart = svg
      .selectAll<SVGGElement, null>('g.chart-root')
      .data([null])
      .join('g')
      .attr('class', 'chart-root')

    // Layer structure
    const containersLayer = chart
      .selectAll<SVGGElement, null>('g.layer-containers')
      .data([null])
      .join('g')
      .attr('class', 'layer-containers')

    const headersLayer = chart
      .selectAll<SVGGElement, null>('g.layer-headers')
      .data([null])
      .join('g')
      .attr('class', 'layer-headers')

    const leavesLayer = chart
      .selectAll<SVGGElement, null>('g.layer-leaves')
      .data([null])
      .join('g')
      .attr('class', 'layer-leaves')

    const labelsLayer = chart
      .selectAll<SVGGElement, null>('g.layer-labels')
      .data([null])
      .join('g')
      .attr('class', 'layer-labels')

    const descendants = layoutRoot.descendants().slice(1) as TreemapNode[]

    // Filter into containers and leaves
    const containerNodes = descendants.filter(
      (d) => d.children && d.children.length > 0 && d.x1 - d.x0 >= 6 && d.y1 - d.y0 >= 6
    )

    const headerNodes = containerNodes.filter((d) => d.x1 - d.x0 >= 24 && d.y1 - d.y0 >= 22)

    const leafNodes = descendants.filter(
      (d) => (!d.children || d.children.length === 0) && d.x1 - d.x0 >= 2 && d.y1 - d.y0 >= 2
    )

    // Helper to tween position & dimensions smoothly
    function tweenRect(axis: 'x0' | 'y0' | 'w' | 'h') {
      return (datum: TreemapNode) => {
        const from = previousShapes.current.get(datum.data.id) ?? shapeOf(datum)
        const to = shapeOf(datum)
        let interpolate: (t: number) => number
        if (axis === 'x0') interpolate = interpolateNumber(from.x0, to.x0)
        else if (axis === 'y0') interpolate = interpolateNumber(from.y0, to.y0)
        else if (axis === 'w')
          interpolate = interpolateNumber(from.x1 - from.x0, to.x1 - to.x0)
        else interpolate = interpolateNumber(from.y1 - from.y0, to.y1 - to.y0)
        return (t: number) => String(Math.max(0, interpolate(t)))
      }
    }

    // ---------------------------------------------------- 1. Container Boxes
    const containers = containersLayer
      .selectAll<SVGRectElement, TreemapNode>('rect.container-box')
      .data(containerNodes, (datum) => datum.data.id)

    containers.exit().remove()

    containers
      .enter()
      .append('rect')
      .attr('class', 'container-box')
      .attr('rx', 3)
      .attr('opacity', 0)
      .attr('x', (datum) => datum.x0)
      .attr('y', (datum) => datum.y0)
      .attr('width', (datum) => Math.max(0, datum.x1 - datum.x0))
      .attr('height', (datum) => Math.max(0, datum.y1 - datum.y0))
      .merge(containers)
      .attr('fill', (datum) => {
        if (datum.depth === 1) {
          const p = getBranchPalette(datum.branchIndex ?? 0)
          return p.tileFill
        }
        return 'rgba(0, 0, 0, 0.25)'
      })
      .attr('fill-opacity', (datum) => (datum.depth === 1 ? 0.08 : 1))
      .attr('stroke', (datum) => {
        if (datum.depth === 1) {
          const p = getBranchPalette(datum.branchIndex ?? 0)
          return p.border
        }
        return 'rgba(255, 255, 255, 0.08)'
      })
      .attr('stroke-width', (datum) => (datum.depth === 1 ? 1.5 : 1))
      .attr('stroke-opacity', (datum) => (datum.depth === 1 ? 0.45 : 0.8))
      .transition()
      .duration(DURATION)
      .ease(easeCubicOut)
      .attr('opacity', 1)
      .attrTween('x', tweenRect('x0'))
      .attrTween('y', tweenRect('y0'))
      .attrTween('width', tweenRect('w'))
      .attrTween('height', tweenRect('h'))

    // --------------------------------------------------- 2. Directory Headers
    const headers = headersLayer
      .selectAll<SVGGElement, TreemapNode>('g.dir-header')
      .data(headerNodes, (datum) => datum.data.id)

    headers.exit().remove()

    const headersEnter = headers.enter().append('g').attr('class', 'dir-header')

    headersEnter.append('rect').attr('class', 'header-bg').attr('rx', 2)
    headersEnter.append('text').attr('class', 'header-title')

    const headersMerge = headersEnter.merge(headers)

    headersMerge.each(function (datum) {
      const g = select(this)
      const p = getBranchPalette(datum.branchIndex ?? 0)
      const w = Math.max(0, datum.x1 - datum.x0)
      const h = Math.max(0, datum.y1 - datum.y0)
      const headerH = w >= 36 && h >= 40 ? 19 : 14

      const isTopLevel = datum.depth === 1

      g.select<SVGRectElement>('rect.header-bg')
        .attr('x', datum.x0)
        .attr('y', datum.y0)
        .attr('width', w)
        .attr('height', headerH)
        .attr('fill', isTopLevel ? p.headerBg : 'rgba(24, 24, 27, 0.9)')
        .attr('fill-opacity', isTopLevel ? 0.35 : 0.95)
        .attr('stroke', isTopLevel ? p.border : 'rgba(255, 255, 255, 0.08)')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', isTopLevel ? 0.45 : 0.7)
        .style('cursor', 'pointer')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation()
          drillInto(datum.data)
        })
        .on('contextmenu', (event: MouseEvent) => {
          event.preventDefault()
          openContextMenu(event.clientX, event.clientY, datum.data)
        })
        .on('mousemove', (event: MouseEvent) => {
          const bounds = containerRef.current?.getBoundingClientRect()
          setTooltip({
            x: event.clientX - (bounds?.left ?? 0),
            y: event.clientY - (bounds?.top ?? 0),
            node: datum.data,
            parentSize: datum.parent?.value ?? datum.data.size
          })
          setHovered(datum.data)
        })
        .on('mouseleave', () => {
          setTooltip(null)
          setHovered(null)
        })

      const maxChars = Math.max(2, Math.floor((w - 8) / 6.2))
      let title = datum.data.name
      if (title.length > maxChars) {
        title = `${title.slice(0, Math.max(1, maxChars - 1))}…`
      }
      if (w >= 140 && headerH >= 19) {
        title = `${title} · ${formatBytes(datum.data.size)}`
      }

      g.select<SVGTextElement>('text.header-title')
        .attr('x', datum.x0 + 6)
        .attr('y', datum.y0 + headerH - (headerH >= 19 ? 5 : 3))
        .attr('fill', '#f4f4f5')
        .attr('font-size', headerH >= 19 ? 10.5 : 9)
        .attr('font-weight', 600)
        .attr('pointer-events', 'none')
        .text(title)
    })

    // --------------------------------------------------------- 3. Leaf Tiles
    const leaves = leavesLayer
      .selectAll<SVGRectElement, TreemapNode>('rect.leaf-tile')
      .data(leafNodes, (datum) => datum.data.id)

    leaves.exit().transition().duration(DURATION / 2).attr('opacity', 0).remove()

    leaves
      .enter()
      .append('rect')
      .attr('class', 'leaf-tile')
      .attr('rx', 2.5)
      .attr('opacity', 0)
      .attr('x', (datum) => datum.x0)
      .attr('y', (datum) => datum.y0)
      .attr('width', (datum) => Math.max(0, datum.x1 - datum.x0))
      .attr('height', (datum) => Math.max(0, datum.y1 - datum.y0))
      .merge(leaves)
      .attr('fill', (datum) => {
        return colorFor(
          datum.data.size,
          colorMode,
          datum.data.modifiedAt,
          datum.data.category,
          datum.branchIndex ?? 0
        )
      })
      .attr('fill-opacity', 0.92)
      .attr('stroke', 'rgba(0, 0, 0, 0.4)')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.85)
      .style('cursor', 'pointer')
      .on('click', (_event, datum) => activate(datum.data))
      .on('contextmenu', (event: MouseEvent, datum) => {
        event.preventDefault()
        openContextMenu(event.clientX, event.clientY, datum.data)
      })
      .on('mouseenter', function (event: MouseEvent, datum) {
        select(this)
          .attr('stroke', 'rgba(255, 255, 255, 0.95)')
          .attr('stroke-width', 2)
          .attr('stroke-opacity', 1)
          .raise()
        const bounds = containerRef.current?.getBoundingClientRect()
        setTooltip({
          x: event.clientX - (bounds?.left ?? 0),
          y: event.clientY - (bounds?.top ?? 0),
          node: datum.data,
          parentSize: datum.parent?.value ?? datum.data.size
        })
        setHovered(datum.data)
      })
      .on('mouseleave', function () {
        select(this)
          .attr('stroke', 'rgba(0, 0, 0, 0.4)')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.85)
        setTooltip(null)
        setHovered(null)
      })
      .transition()
      .duration(DURATION)
      .ease(easeCubicOut)
      .attr('opacity', 1)
      .attrTween('x', tweenRect('x0'))
      .attrTween('y', tweenRect('y0'))
      .attrTween('width', tweenRect('w'))
      .attrTween('height', tweenRect('h'))

    // ---------------------------------------------------- 4. Leaf Text Labels
    const labelledLeaves = leafNodes.filter((datum) => {
      const w = datum.x1 - datum.x0
      const h = datum.y1 - datum.y0
      return w >= 32 && h >= 18
    })

    const leafLabels = labelsLayer
      .selectAll<SVGGElement, TreemapNode>('g.leaf-label')
      .data(labelledLeaves, (datum) => datum.data.id)

    leafLabels.exit().remove()

    const leafLabelsEnter = leafLabels.enter().append('g').attr('class', 'leaf-label')
    leafLabelsEnter.append('text').attr('class', 'leaf-name')
    leafLabelsEnter.append('text').attr('class', 'leaf-size')

    const leafLabelsMerge = leafLabelsEnter.merge(leafLabels)

    leafLabelsMerge.each(function (datum) {
      const g = select(this)
      const w = datum.x1 - datum.x0
      const h = datum.y1 - datum.y0

      const maxChars = Math.max(2, Math.floor((w - 6) / 5.8))
      let name = datum.data.name
      if (name.length > maxChars) {
        name = `${name.slice(0, Math.max(1, maxChars - 1))}…`
      }

      const showSize = h >= 32 && w >= 40

      g.select<SVGTextElement>('text.leaf-name')
        .attr('x', datum.x0 + 4)
        .attr('y', datum.y0 + (showSize ? 12 : Math.min(14, h / 2 + 4)))
        .attr('fill', '#ffffff')
        .attr('font-size', Math.min(11, Math.max(9, Math.floor(w / 11))))
        .attr('font-weight', 500)
        .attr('pointer-events', 'none')
        .text(name)

      const sizeText = g.select<SVGTextElement>('text.leaf-size')
      if (showSize) {
        sizeText
          .attr('x', datum.x0 + 4)
          .attr('y', datum.y0 + 24)
          .attr('fill', 'rgba(255, 255, 255, 0.72)')
          .attr('font-size', 9.5)
          .attr('font-weight', 400)
          .attr('pointer-events', 'none')
          .text(formatBytes(datum.data.size))
      } else {
        sizeText.text('')
      }
    })

    // Save shapes for next animation
    const next = new Map<string, RectShape>()
    for (const datum of descendants) next.set(datum.data.id, shapeOf(datum))
    previousShapes.current = next
  }, [
    layoutRoot,
    colorMode,
    width,
    height,
    activate,
    openContextMenu,
    setHovered
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
    <div className="flex h-full w-full flex-col">
      {/* Navigation bar — always visible above the treemap */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-glass)] px-6 py-2.5 overflow-hidden">
        <Button
          size="sm"
          variant="secondary"
          icon={ArrowLeft}
          disabled={!canGoBack}
          onClick={zoomOut}
          className="shadow-sm"
        >
          Back
        </Button>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {pathStack.map((stackNode, index) => {
            const isLast = index === pathStack.length - 1
            return (
              <span key={stackNode.id} className="flex min-w-0 items-center shrink-0">
                {index > 0 ? (
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0 mx-0.5" />
                ) : null}
                <button
                  type="button"
                  onClick={() => zoomTo(index)}
                  title={stackNode.path}
                  className={`mac-ease max-w-[160px] truncate rounded-md px-2 py-0.5 text-label transition-colors duration-150 ${
                    isLast
                      ? 'font-medium text-[var(--text-primary)] bg-[var(--bg-hover)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {index === 0 ? stackNode.name || stackNode.path : stackNode.name}
                </button>
              </span>
            )
          })}
        </nav>
        <div className="shrink-0 pl-2">
          <ColorLegend mode={colorMode} />
        </div>
      </div>

      {/* Treemap chart area */}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        <svg ref={svgRef} width={width} height={height} className="block select-none" />

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-40 max-w-[280px] animate-fade-in rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 shadow-xl backdrop-blur-2xl"
            style={{
              left: Math.min(tooltip.x + 14, Math.max(0, width - 270)),
              top: Math.min(tooltip.y + 14, Math.max(0, height - 70))
            }}
          >
            <p className="truncate text-body font-semibold text-[var(--text-primary)]">
              {tooltip.node.name}
            </p>
            <p className="text-label tabular-nums text-[var(--text-secondary)]">
              {formatBytes(tooltip.node.size)} ·{' '}
              {formatPercent(tooltip.node.size, tooltip.parentSize)} of parent
              {tooltip.node.type === 'directory' && tooltip.node.children
                ? ` · ${formatCount(tooltip.node.children.length)} items`
                : ''}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-tertiary)]">
              {tooltip.node.path}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
