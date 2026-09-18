import { useMemo } from 'react'
import { FolderSearch, Trash2 } from 'lucide-react'
import { useFileActions } from '@renderer/hooks/useFileActions'
import { useScanStore } from '@renderer/stores/useScanStore'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { CATEGORY_COLORS } from '@renderer/utils/categorize'
import { BUCKET_COLORS, BUCKET_LABELS, sizeBucket } from '@renderer/utils/colorScale'
import { formatBytes, truncatePath } from '@renderer/utils/formatBytes'
import { topFiles } from '@renderer/utils/tree'
import { Badge, Spinner } from './Primitives'
import { FileIcon } from './FileIcon'

const LIMIT = 50

export function LargeFilesPanel(): JSX.Element {
  const root = useScanStore((state) => state.root)
  const scanning = useScanStore((state) => state.scanning)
  const setSelection = useSelectionStore((state) => state.set)
  const setAnchor = useSelectionStore((state) => state.setAnchor)
  const actions = useFileActions()

  // One O(n) walk of the tree, memoised per scan.
  const files = useMemo(() => (root ? topFiles(root, LIMIT) : []), [root])

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
        Scan a volume or folder to see its largest files.
      </p>
    )
  }

  if (files.length === 0) {
    return (
      <p className="py-6 text-center text-body text-[var(--text-tertiary)]">
        No files found in this scan.
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {files.map((file) => {
        const bucket = sizeBucket(file.size)
        return (
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
              <p
                className="truncate font-mono text-label text-[var(--text-tertiary)]"
                title={file.path}
              >
                {truncatePath(file.path, 2)}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-body tabular-nums">{formatBytes(file.size)}</span>
              <Badge color={BUCKET_COLORS[bucket]}>
                {file.category && file.category !== 'Other' ? file.category : BUCKET_LABELS[bucket]}
              </Badge>
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

            {file.category && file.category !== 'Other' ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[file.category] }}
                title={file.category}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
