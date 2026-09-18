import { useMemo } from 'react'
import { CheckSquare, Folder, HardDrive, Layers } from 'lucide-react'
import { currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { formatBytes, formatCount } from '@renderer/utils/formatBytes'

export function StatusBar(): JSX.Element | null {
  const current = useScanStore(currentDirectory)
  const root = useScanStore((state) => state.root)
  const scanPath = useScanStore((state) => state.scanPath)
  const selected = useSelectionStore((state) => state.selected)

  const childCount = current?.children?.length ?? 0

  const selectionSummary = useMemo(() => {
    if (selected.size === 0) return null
    let totalSize = 0
    for (const item of selected.values()) {
      totalSize += item.size
    }
    return {
      count: selected.size,
      size: totalSize
    }
  }, [selected])

  if (!root || !current) return null

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--bg-glass)]/90 px-3 text-[11px] text-[var(--text-tertiary)] backdrop-blur-md select-none">
      {/* Left: Current directory info */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-1 font-mono text-[var(--text-secondary)]">
          <Folder className="h-3 w-3 text-[var(--accent-blue)]" />
          <span className="truncate max-w-[240px]" title={current.path}>
            {current.name || current.path}
          </span>
        </div>

        <span className="text-[var(--border)]">|</span>

        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3" />
          <span>
            {formatCount(childCount)} {childCount === 1 ? 'item' : 'items'} ({formatBytes(current.size)})
          </span>
        </div>
      </div>

      {/* Right: Selection & Volume info */}
      <div className="flex shrink-0 items-center gap-3">
        {selectionSummary ? (
          <div className="flex items-center gap-1.5 rounded bg-[var(--accent-blue)]/10 px-1.5 py-0.5 font-medium text-[var(--accent-blue)]">
            <CheckSquare className="h-3 w-3" />
            <span>
              {selectionSummary.count} selected ({formatBytes(selectionSummary.size)})
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
          <HardDrive className="h-3 w-3" />
          <span className="truncate max-w-[160px]" title={scanPath ?? undefined}>
            {scanPath}
          </span>
        </div>
      </div>
    </footer>
  )
}
