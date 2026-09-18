import { useMemo, useState } from 'react'
import { Calendar, CheckSquare, Clock, FolderSearch, Trash2 } from 'lucide-react'
import { useFileActions } from '@renderer/hooks/useFileActions'
import { useScanStore } from '@renderer/stores/useScanStore'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { CATEGORY_COLORS } from '@renderer/utils/categorize'
import {
  formatBytes,
  formatCount,
  formatRelativeDate,
  truncatePath
} from '@renderer/utils/formatBytes'
import { collectFiles } from '@renderer/utils/tree'
import { Badge, Button, Spinner } from './Primitives'
import { FileIcon } from './FileIcon'

const AGE_OPTIONS = [
  { label: 'Older than 6 months', days: 180 },
  { label: 'Older than 1 year', days: 365 },
  { label: 'Older than 2 years', days: 730 },
  { label: 'Older than 5 years', days: 1825 }
] as const

const LIMIT = 100

export function OldFilesPanel(): JSX.Element {
  const root = useScanStore((state) => state.root)
  const scanning = useScanStore((state) => state.scanning)
  const setSelection = useSelectionStore((state) => state.set)
  const setAnchor = useSelectionStore((state) => state.setAnchor)
  const addSelection = useSelectionStore((state) => state.add)
  const actions = useFileActions()

  const [selectedDays, setSelectedDays] = useState<number>(365)

  // Collect and filter old files
  const { oldFiles, totalBytes } = useMemo(() => {
    if (!root) return { oldFiles: [], totalBytes: 0 }
    const allFiles = collectFiles(root)
    const cutoff = Date.now() - selectedDays * 24 * 60 * 60 * 1000

    const filtered = allFiles.filter((f) => f.modifiedAt && f.modifiedAt < cutoff)
    // Sort largest first to help reclaim space quickly
    filtered.sort((a, b) => b.size - a.size)

    const bytes = filtered.reduce((acc, f) => acc + f.size, 0)
    return {
      oldFiles: filtered.slice(0, LIMIT),
      totalBytes: bytes
    }
  }, [root, selectedDays])

  if (scanning && !root) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (!root) {
    return (
      <p className="py-6 text-center text-body text-[var(--text-tertiary)]">
        Scan a volume or folder to find old unaccessed files.
      </p>
    )
  }

  const handleSelectAll = (): void => {
    addSelection(oldFiles)
  }

  return (
    <div className="space-y-3">
      {/* Filter and summary bar */}
      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-glass)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-label text-[var(--text-secondary)]">
            <Clock className="h-3.5 w-3.5 text-[var(--accent-orange)]" />
            <span className="font-medium">Age Filter</span>
          </div>
          <select
            value={selectedDays}
            onChange={(e) => setSelectedDays(Number(e.target.value))}
            className="h-6 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 text-label text-[var(--text-primary)] focus:outline-none"
          >
            {AGE_OPTIONS.map((opt) => (
              <option key={opt.days} value={opt.days}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-[var(--border)] text-label">
          <span className="text-[var(--text-tertiary)]">
            {formatCount(oldFiles.length)} files ({formatBytes(totalBytes)})
          </span>
          {oldFiles.length > 0 ? (
            <Button size="sm" variant="ghost" icon={CheckSquare} onClick={handleSelectAll}>
              Select all
            </Button>
          ) : null}
        </div>
      </div>

      {oldFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-tertiary)]">
          <Calendar className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-body">No files match this age threshold.</p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {oldFiles.map((file) => (
            <li
              key={file.id}
              onDoubleClick={() => actions.reveal(file)}
              onContextMenu={(event) => {
                event.preventDefault()
                setSelection([file])
                setAnchor(file.path)
              }}
              className="mac-ease group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-100 hover:bg-[var(--bg-hover)]"
            >
              <FileIcon node={file} className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-body" title={file.path}>
                  {file.name}
                </p>
                <div className="flex items-center gap-1.5 text-label text-[var(--text-tertiary)]">
                  <span title={file.path}>{truncatePath(file.path, 2)}</span>
                  <span>·</span>
                  <span className="text-[var(--accent-orange)]">
                    {formatRelativeDate(file.modifiedAt)}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-body tabular-nums">{formatBytes(file.size)}</span>
                {file.category && file.category !== 'Other' ? (
                  <Badge color={CATEGORY_COLORS[file.category]}>{file.category}</Badge>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Reveal in Finder"
                  aria-label={`Reveal ${file.name} in Finder`}
                  onClick={() => actions.reveal(file)}
                  className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-glass)] hover:text-[var(--text-primary)]"
                >
                  <FolderSearch className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title="Move to Trash"
                  aria-label={`Move ${file.name} to the Trash`}
                  onClick={() => void actions.moveToTrash([file])}
                  className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--accent-red)] hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
