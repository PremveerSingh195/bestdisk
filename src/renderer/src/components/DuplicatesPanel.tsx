import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FolderSearch, Search, Trash2 } from 'lucide-react'
import type { DuplicateGroup, DuplicateProgress } from '@shared/types'
import { useFileActions } from '@renderer/hooks/useFileActions'
import { useScanStore } from '@renderer/stores/useScanStore'
import { formatBytes, formatItems, truncatePath } from '@renderer/utils/formatBytes'
import { Button, Checkbox, ProgressBar } from './Primitives'

const STAGE_LABELS: Record<DuplicateProgress['stage'], string> = {
  sizing: 'Grouping files by size…',
  'partial-hash': 'Comparing the first 64 KB…',
  'full-hash': 'Hashing full contents…',
  done: 'Finished'
}

export function DuplicatesPanel(): JSX.Element {
  const scanPath = useScanStore((state) => state.scanPath)
  const actions = useFileActions()

  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<DuplicateProgress | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Progress events are only relevant while this panel is mounted.
  useEffect(() => {
    return window.diskAPI.onDuplicateProgress(setProgress)
  }, [])

  const run = useCallback(async (): Promise<void> => {
    if (!scanPath) return

    setLoading(true)
    setError(null)
    setProgress(null)

    try {
      const found = await window.diskAPI.findDuplicates(scanPath)
      setGroups(found)

      // Default to keeping the first copy of each set and flagging the rest.
      const preselect = new Set<string>()
      for (const group of found) {
        for (const file of group.files.slice(1)) preselect.add(file)
      }
      setSelected(preselect)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [scanPath])

  // Runs once per scanned path, not on every render of the panel.
  const lastScanned = useRef<string | null>(null)
  useEffect(() => {
    if (!scanPath || lastScanned.current === scanPath) return
    lastScanned.current = scanPath
    void run()
  }, [scanPath, run])

  const waste = useMemo(
    () =>
      groups.reduce((sum, group) => {
        const removed = group.files.filter((file) => selected.has(file)).length
        return sum + group.size * removed
      }, 0),
    [groups, selected]
  )

  const toggleFile = (file: string): void => {
    const next = new Set(selected)
    if (next.has(file)) next.delete(file)
    else next.add(file)
    setSelected(next)
  }

  const cleanup = async (): Promise<void> => {
    const paths = [...selected]
    if (paths.length === 0) return

    await actions.trashPaths(paths, waste)

    // Whatever survived (or was cancelled) stays visible; recompute the groups.
    setGroups((current) =>
      current
        .map((group) => ({ ...group, files: group.files.filter((file) => !paths.includes(file)) }))
        .filter((group) => group.files.length > 1)
    )
    setSelected(new Set())
  }

  if (!scanPath) {
    return (
      <p className="py-6 text-center text-body text-[var(--text-tertiary)]">
        Scan a volume first, then look for duplicate files inside it.
      </p>
    )
  }

  if (loading) {
    const processed = progress?.processed ?? 0
    const total = progress?.total ?? 0
    return (
      <div className="space-y-3 py-4">
        <p className="text-body text-[var(--text-secondary)]">
          {progress ? STAGE_LABELS[progress.stage] : 'Starting…'}
        </p>
        <ProgressBar value={processed} max={Math.max(total, 1)} />
        <p className="text-label tabular-nums text-[var(--text-tertiary)]">
          {total > 0 ? `${formatItems(processed, 'file')} of ${formatItems(total, 'file')}` : '—'}
        </p>
        <Button variant="secondary" size="sm" disabled>
          Scanning for duplicates…
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-body text-[var(--accent-red)]">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void run()}>
          Try again
        </Button>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center">
        <Search className="mx-auto h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <p className="text-body text-[var(--text-secondary)]">No duplicates found yet.</p>
        <Button variant="secondary" size="sm" onClick={() => void run()}>
          Find duplicates
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-label text-[var(--text-secondary)]">
          {formatItems(groups.length, 'group')} · {formatBytes(waste)} reclaimable
        </p>
        <Button variant="ghost" size="sm" onClick={() => void run()}>
          Rescan
        </Button>
      </div>

      <ul className="space-y-3">
        {groups.map((group) => (
          <li
            key={group.hash}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-glass)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-2.5 py-1.5">
              <span className="flex items-center gap-1.5">
                <Copy className="h-3.5 w-3.5 text-[var(--accent-purple)]" strokeWidth={1.75} />
                <span className="text-body font-medium tabular-nums">
                  {formatItems(group.files.length, 'copy', 'copies')}
                </span>
              </span>
              <span className="text-label tabular-nums text-[var(--text-secondary)]">
                {formatBytes(group.size)} each · {formatBytes(group.size * (group.files.length - 1))}{' '}
                wasted
              </span>
            </div>

            <ul className="divide-y divide-[var(--border)]">
              {group.files.map((file, index) => (
                <li key={file} className="flex items-center gap-2 px-2.5 py-1.5">
                  <Checkbox
                    checked={selected.has(file)}
                    onChange={() => toggleFile(file)}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body" title={file}>
                      {file.split('/').pop()}
                    </p>
                    <p className="truncate font-mono text-label text-[var(--text-tertiary)]" title={file}>
                      {truncatePath(file, 3)}
                    </p>
                  </div>
                  {index === 0 ? (
                    <span className="shrink-0 rounded-full border border-[var(--accent-green)]/40 px-1.5 py-[1px] text-label text-[var(--accent-green)]">
                      keep
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Reveal ${file} in Finder`}
                    title="Reveal in Finder"
                    onClick={() => void window.diskAPI.revealInFinder(file)}
                    className="shrink-0 rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <FolderSearch className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-primary)] py-2 backdrop-blur-2xl">
        <span className="text-label tabular-nums text-[var(--text-secondary)]">
          {selected.size} of {groups.reduce((sum, group) => sum + group.files.length, 0)} flagged
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Trash2}
            disabled={selected.size === 0}
            onClick={() => void cleanup()}
          >
            Clean {selected.size} selected
          </Button>
        </div>
      </div>
    </div>
  )
}
