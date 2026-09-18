import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  LayoutGrid,
  Layers,
  List,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Sun,
  X
} from 'lucide-react'
import type { ColorMode, DiskNode, SortKey, ViewMode } from '@shared/types'
import { currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { selectedBytes, useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { formatBytes, formatItems } from '@renderer/utils/formatBytes'
import { searchTree } from '@renderer/utils/tree'
import { IconButton, SegmentedControl } from './Primitives'

export const FILTER_INPUT_ID = 'disklens-filter-input'

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; icon: typeof Layers }> = [
  { value: 'sunburst', label: 'Sunburst', icon: Layers },
  { value: 'treemap', label: 'Treemap', icon: LayoutGrid },
  { value: 'list', label: 'List', icon: List }
]

const SORT_LABELS: Record<SortKey, string> = {
  size: 'Size',
  name: 'Name',
  modified: 'Date',
  type: 'Kind'
}

const COLOR_OPTIONS: Array<{ value: ColorMode; label: string }> = [
  { value: 'folder', label: 'Folder' },
  { value: 'category', label: 'Type' },
  { value: 'size', label: 'Size' },
  { value: 'age', label: 'Age' }
]

const THEME_ICONS = { system: Monitor, dark: Moon, light: Sun } as const

export function ToolBar(): JSX.Element {
  const root = useScanStore((state) => state.root)
  const view = useScanStore((state) => state.view)
  const setView = useScanStore((state) => state.setView)
  const sortKey = useScanStore((state) => state.sortKey)
  const sortDirection = useScanStore((state) => state.sortDirection)
  const setSort = useScanStore((state) => state.setSort)
  const filter = useScanStore((state) => state.filter)
  const setFilter = useScanStore((state) => state.setFilter)
  const colorMode = useScanStore((state) => state.colorMode)
  const setColorMode = useScanStore((state) => state.setColorMode)
  const pathStack = useScanStore((state) => state.pathStack)
  const zoomTo = useScanStore((state) => state.zoomTo)
  const zoomOut = useScanStore((state) => state.zoomOut)
  const navigateToPath = useScanStore((state) => state.navigateToPath)
  const setNotice = useScanStore((state) => state.setNotice)
  const rescan = useScanStore((state) => state.rescan)
  const scanning = useScanStore((state) => state.scanning)
  const current = useScanStore(currentDirectory)

  const selectionCount = useSelectionStore((state) => state.selected.size)
  const selectedTotal = useSelectionStore(selectedBytes)
  const setSelected = useSelectionStore((state) => state.set)

  const theme = useUiStore((state) => state.theme)
  const cycleTheme = useUiStore((state) => state.cycleTheme)

  const [exportOpen, setExportOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const ThemeIcon = THEME_ICONS[theme]
  const canZoomOut = pathStack.length > 1

  // Global search results across the entire scanned volume
  const searchResults = useMemo(() => {
    if (!root || filter.trim().length < 2) return []
    return searchTree(root, filter, 8)
  }, [root, filter])

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false)
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExport = async (format: 'csv' | 'json'): Promise<void> => {
    setExportOpen(false)
    if (!root) return
    setNotice(`Exporting scan to ${format.toUpperCase()}…`)
    try {
      const res = await window.diskAPI.exportScan(format, root)
      if (res.success && res.filePath) {
        setNotice(`Exported scan to ${res.filePath}`)
      } else if (res.error) {
        setNotice(`Export failed: ${res.error}`)
      } else {
        setNotice(null)
      }
    } catch (err) {
      setNotice(`Export error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSelectSearchResult = (node: DiskNode): void => {
    setSearchFocused(false)
    navigateToPath(node.path)
    if (node.type === 'file') {
      setSelected([node])
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 overflow-hidden">
      <IconButton
        icon={ArrowLeft}
        label="Go up one level (Backspace)"
        disabled={!canZoomOut}
        onClick={zoomOut}
      />

      {/* Breadcrumb trail over the drill-down stack. */}
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {pathStack.length === 0 ? (
          <span className="truncate text-body text-[var(--text-tertiary)]">No scan yet</span>
        ) : (
          pathStack.map((node, index) => {
            const isLast = index === pathStack.length - 1
            return (
              <span key={node.id} className="flex min-w-0 items-center">
                {index > 0 ? <span className="px-0.5 text-[var(--text-tertiary)]">/</span> : null}
                <button
                  type="button"
                  onClick={() => zoomTo(index)}
                  title={node.path}
                  className={`mac-ease max-w-[140px] truncate rounded-md px-1.5 py-0.5 text-body transition-colors duration-150 ${
                    isLast
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {index === 0 ? node.name || node.path : node.name}
                </button>
              </span>
            )
          })
        )}
      </nav>

      {/* Controls group on the right */}
      <div className="flex shrink-0 items-center gap-1.5">
        {view === 'list' && current ? (
          <div className="flex items-center gap-1">
            <select
              value={sortKey}
              aria-label="Sort by"
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-7 rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] px-1.5 text-label text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key} className="bg-[var(--bg-primary)]">
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
            <IconButton
              icon={sortDirection === 'asc' ? ChevronUp : ChevronDown}
              label={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              onClick={() => setSort(sortKey)}
            />
          </div>
        ) : null}

        {/* Search and recursive filter dropdown */}
        <div ref={searchContainerRef} className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          <input
            id={FILTER_INPUT_ID}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="Filter…"
            className="mac-ease h-7 w-[100px] sm:w-[125px] rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] pl-7 pr-6 text-body text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-200 focus:w-[160px] focus:border-[var(--accent-blue)] focus:outline-none"
          />
          {filter ? (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setFilter('')}
              className="absolute right-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {/* Global recursive search results popover */}
          {searchFocused && searchResults.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-[300px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl backdrop-blur-2xl">
              <div className="border-b border-[var(--border)] bg-[var(--bg-hover)]/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                Global Volume Matches ({searchResults.length})
              </div>
              <div className="max-h-[260px] overflow-y-auto p-1">
                {searchResults.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(match)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-body text-[var(--text-primary)] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                  >
                    {match.type === 'directory' ? (
                      <Folder className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[12px]">{match.name}</p>
                      <p className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                        {match.path}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                      {formatBytes(match.size)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Color mode selector */}
        <div className="flex items-center gap-1">
          <Palette className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0 hidden sm:block" />
          <select
            value={colorMode}
            aria-label="Color scheme"
            onChange={(event) => setColorMode(event.target.value as ColorMode)}
            className="h-7 rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] px-2 text-label text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:outline-none cursor-pointer"
          >
            {COLOR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                Color: {opt.label}
              </option>
            ))}
          </select>
        </div>

        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} />

        {selectionCount > 0 ? (
          <span className="hidden xl:inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-glass)] px-2 py-0.5 text-label tabular-nums text-[var(--text-secondary)]">
            {formatItems(selectionCount, 'item')} · {formatBytes(selectedTotal)}
          </span>
        ) : null}

      {/* Export menu */}
      <div ref={exportRef} className="relative">
        <IconButton
          icon={Download}
          label="Export Scan Results"
          disabled={!root || scanning}
          onClick={() => setExportOpen((prev) => !prev)}
        />
        {exportOpen ? (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => void handleExport('csv')}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              <FileSpreadsheet className="h-4 w-4 text-[var(--accent-teal)]" />
              <div>
                <p className="font-medium text-[12px]">Export as CSV</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Spreadsheet table</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void handleExport('json')}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              <FileText className="h-4 w-4 text-[var(--accent-blue)]" />
              <div>
                <p className="font-medium text-[12px]">Export as JSON</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Full hierarchy tree</p>
              </div>
            </button>
          </div>
        ) : null}
      </div>

      <IconButton
        icon={RefreshCw}
        label="Rescan (⌘R)"
        disabled={scanning || pathStack.length === 0}
        onClick={rescan}
      />
      <IconButton icon={ThemeIcon} label={`Theme: ${theme}`} onClick={cycleTheme} />
      </div>
    </div>
  )
}
