import { useCallback, useMemo, useRef } from 'react'
import { FixedSizeList } from 'react-window'
import type { ListChildComponentProps } from 'react-window'
import clsx from 'clsx'
import { ChevronRight, Search } from 'lucide-react'
import type { ColorMode, DiskNode, SortKey } from '@shared/types'
import { useElementSize } from '@renderer/hooks/useElementSize'
import { currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { selectedBytes, useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { CATEGORY_COLORS } from '@renderer/utils/categorize'
import { colorFor } from '@renderer/utils/colorScale'
import { formatBytes, formatDate, formatItems } from '@renderer/utils/formatBytes'
import { childCount, childTotal, matchesFilter, sortNodes } from '@renderer/utils/tree'
import { Badge } from './Primitives'
import { FileIcon } from './FileIcon'

const ROW_HEIGHT = 30
const HEADER_HEIGHT = 26
/** Height of the summary strip under the list. */
const FOOTER_HEIGHT = 22
const COLUMNS = { select: 26, size: 108, items: 62, modified: 132, kind: 92 } as const

interface HeaderSpec {
  key: SortKey | null
  label: string
  width?: number
  align: 'left' | 'right'
}

const HEADERS: HeaderSpec[] = [
  { key: 'name', label: 'Name', align: 'left' },
  { key: 'size', label: 'Size', width: COLUMNS.size, align: 'right' },
  { key: null, label: 'Items', width: COLUMNS.items, align: 'right' },
  { key: 'modified', label: 'Last Modified', width: COLUMNS.modified, align: 'right' },
  { key: 'type', label: 'Kind', width: COLUMNS.kind, align: 'right' }
]

interface RowData {
  nodes: DiskNode[]
  parentSize: number
  colorMode: ColorMode
  isSelected: (path: string) => boolean
  onClick: (event: React.MouseEvent, node: DiskNode, index: number) => void
  onDoubleClick: (node: DiskNode) => void
  onContextMenu: (event: React.MouseEvent, node: DiskNode) => void
}

function Row({ index, style, data }: ListChildComponentProps<RowData>): JSX.Element {
  const node = data.nodes[index]
  if (!node) return <div style={style} />

  const selected = data.isSelected(node.path)
  const share = data.parentSize > 0 ? node.size / data.parentSize : 0
  const isDirectory = node.type === 'directory'

  return (
    <div style={style}>
      <div
        onClick={(event) => data.onClick(event, node, index)}
        onDoubleClick={() => data.onDoubleClick(node)}
        onContextMenu={(event) => data.onContextMenu(event, node)}
        className={clsx(
          'group flex h-full cursor-default items-center border-b border-[var(--border)]/40 pl-3 transition-colors duration-100',
          selected ? 'bg-[var(--accent-blue)]/15' : 'hover:bg-[var(--bg-hover)]'
        )}
      >
        <div style={{ width: COLUMNS.select }} className="flex shrink-0 items-center">
          <input
            type="checkbox"
            checked={selected}
            readOnly
            tabIndex={-1}
            aria-label={`Select ${node.name}`}
            className={clsx(
              'h-3.5 w-3.5 cursor-pointer accent-[var(--accent-blue)] transition-opacity',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
          <FileIcon
            node={node}
            className="h-4 w-4 text-[var(--text-secondary)]"
            color={colorFor(node.size, data.colorMode, node.modifiedAt, node.category, index)}
          />
          <span className="truncate text-body" title={node.path}>
            {node.name}
          </span>
          {isDirectory ? (
            <ChevronRight
              className="h-3 w-3 shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
              strokeWidth={2}
            />
          ) : null}
        </div>

        <div style={{ width: COLUMNS.size }} className="shrink-0 pr-3">
          <div className="text-right text-body tabular-nums">{formatBytes(node.size)}</div>
          <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, share * 100)}%`,
                backgroundColor: colorFor(
                  node.size,
                  data.colorMode,
                  node.modifiedAt,
                  node.category,
                  index
                )
              }}
            />
          </div>
        </div>

        <div
          style={{ width: COLUMNS.items }}
          className="shrink-0 pr-3 text-right text-label tabular-nums text-[var(--text-secondary)]"
        >
          {isDirectory ? formatItems(childCount(node), 'item') : ''}
        </div>

        <div
          style={{ width: COLUMNS.modified }}
          className="shrink-0 pr-3 text-right text-label tabular-nums text-[var(--text-secondary)]"
        >
          {formatDate(node.modifiedAt)}
        </div>

        <div style={{ width: COLUMNS.kind }} className="flex shrink-0 justify-end pr-3">
          {node.category && node.category !== 'Other' ? (
            <Badge color={CATEGORY_COLORS[node.category]}>{node.category}</Badge>
          ) : (
            <span className="text-label text-[var(--text-tertiary)]">
              {isDirectory ? 'Folder' : 'File'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function FileList(): JSX.Element | null {
  const node = useScanStore(currentDirectory)
  const sortKey = useScanStore((state) => state.sortKey)
  const sortDirection = useScanStore((state) => state.sortDirection)
  const setSort = useScanStore((state) => state.setSort)
  const filter = useScanStore((state) => state.filter)
  const colorMode = useScanStore((state) => state.colorMode)
  const drillInto = useScanStore((state) => state.drillInto)

  const selected = useSelectionStore((state) => state.selected)
  const selectedCount = useSelectionStore((state) => state.selected.size)
  const selectedTotal = useSelectionStore(selectedBytes)
  const isSelected = useSelectionStore((state) => state.isSelected)
  const toggle = useSelectionStore((state) => state.toggle)
  const setSelection = useSelectionStore((state) => state.set)
  const setAnchor = useSelectionStore((state) => state.setAnchor)
  const anchorPath = useSelectionStore((state) => state.anchorPath)

  const openContextMenu = useUiStore((state) => state.openContextMenu)
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>()

  const nodes = useMemo(() => {
    if (!node?.children) return []
    const filtered = node.children.filter((child) => matchesFilter(child, filter))
    return sortNodes(filtered, sortKey, sortDirection)
  }, [node, filter, sortKey, sortDirection])

  const parentSize = useMemo(() => (node ? childTotal(node) : 0), [node])

  const handleClick = useCallback(
    (event: React.MouseEvent, target: DiskNode, index: number): void => {
      if (event.metaKey || event.ctrlKey) {
        toggle(target)
        setAnchor(target.path)
        return
      }
      if (event.shiftKey && anchorPath) {
        const anchorIndex = nodes.findIndex((entry) => entry.path === anchorPath)
        if (anchorIndex >= 0) {
          const start = Math.min(anchorIndex, index)
          const end = Math.max(anchorIndex, index)
          setSelection(nodes.slice(start, end + 1))
          return
        }
      }
      setSelection([target])
      setAnchor(target.path)
    },
    [anchorPath, nodes, setAnchor, setSelection, toggle]
  )

  const handleDoubleClick = useCallback(
    (target: DiskNode): void => {
      if (target.type === 'directory' && target.children && target.children.length > 0) {
        drillInto(target)
        return
      }
      void window.diskAPI.revealInFinder(target.path)
    },
    [drillInto]
  )

  const listRef = useRef<FixedSizeList<RowData>>(null)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (nodes.length === 0) return

      const currentIndex = anchorPath
        ? nodes.findIndex((entry) => entry.path === anchorPath)
        : -1

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const nextIndex = Math.min(nodes.length - 1, currentIndex + 1)
        const target = nodes[nextIndex]
        if (target) {
          setSelection([target])
          setAnchor(target.path)
          listRef.current?.scrollToItem(nextIndex, 'smart')
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        const prevIndex = Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)
        const target = nodes[prevIndex]
        if (target) {
          setSelection([target])
          setAnchor(target.path)
          listRef.current?.scrollToItem(prevIndex, 'smart')
        }
      } else if (event.key === 'Enter') {
        if (currentIndex >= 0 && nodes[currentIndex]) {
          const target = nodes[currentIndex]
          if (target.type === 'directory' && target.children && target.children.length > 0) {
            drillInto(target)
          } else {
            void window.diskAPI.revealInFinder(target.path)
          }
        }
      }
    },
    [anchorPath, drillInto, nodes, setAnchor, setSelection]
  )

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, target: DiskNode): void => {
      // Right-clicking outside the selection focuses the clicked row first.
      if (!selected.has(target.path)) {
        setSelection([target])
        setAnchor(target.path)
      }
      openContextMenu(event.clientX, event.clientY, target)
    },
    [openContextMenu, selected, setAnchor, setSelection]
  )

  const itemData = useMemo<RowData>(
    () => ({
      nodes,
      parentSize,
      colorMode,
      isSelected,
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
      onContextMenu: handleContextMenu
    }),
    [
      nodes,
      parentSize,
      colorMode,
      isSelected,
      handleClick,
      handleDoubleClick,
      handleContextMenu
    ]
  )

  if (!node) return null

  if (!node.children || node.children.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-body text-[var(--text-secondary)]">
        This folder is empty.
      </div>
    )
  }

  const listHeight = Math.max(0, height - HEADER_HEIGHT - FOOTER_HEIGHT)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full w-full flex-col overflow-hidden outline-none"
    >
      <div
        className="flex shrink-0 items-center border-b border-[var(--border)] pl-3 text-label font-semibold uppercase tracking-wide text-[var(--text-tertiary)]"
        style={{ height: HEADER_HEIGHT }}
      >
        <div style={{ width: COLUMNS.select }} className="shrink-0" />
        {HEADERS.map((header) => (
          <button
            key={header.label}
            type="button"
            disabled={header.key === null}
            onClick={() => {
              if (header.key) setSort(header.key)
            }}
            style={header.width ? { width: header.width } : undefined}
            className={clsx(
              'truncate py-1 transition-colors duration-100',
              header.align === 'right' ? 'shrink-0 pr-3 text-right' : 'min-w-0 flex-1 text-left',
              header.key ? 'hover:text-[var(--text-primary)]' : 'cursor-default'
            )}
          >
            {header.label}
            {sortKey === header.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
      </div>

      {nodes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Search className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-body text-[var(--text-secondary)]">
            Nothing here matches “{filter}”.
          </p>
        </div>
      ) : (
        <FixedSizeList
          ref={listRef}
          height={listHeight}
          width={width}
          itemCount={nodes.length}
          itemSize={ROW_HEIGHT}
          itemData={itemData}
          overscanCount={8}
        >
          {Row}
        </FixedSizeList>
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-3 py-1 text-label tabular-nums text-[var(--text-tertiary)]">
        <span>{formatItems(nodes.length, 'item')}</span>
        <span>
          {formatBytes(parentSize)} in total
          {selectedCount > 0 ? ` · ${formatBytes(selectedTotal)} selected` : ''}
        </span>
      </div>
    </div>
  )
}
