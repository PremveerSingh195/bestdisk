import { Eraser, Trash2, X } from 'lucide-react'
import { useFileActions } from '@renderer/hooks/useFileActions'
import { selectedBytes, useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useScanStore } from '@renderer/stores/useScanStore'
import { currentDirectory } from '@renderer/stores/useScanStore'
import { childTotal } from '@renderer/utils/tree'
import { formatBytes, formatItems, formatPercent } from '@renderer/utils/formatBytes'
import { Button } from './Primitives'

/**
 * Slides up from the bottom whenever items are selected. Keeps destructive
 * actions one gesture away without cluttering the toolbar.
 */
export function CleanupDrawer(): JSX.Element | null {
  const selected = useSelectionStore((state) => state.selected)
  const selectionTotal = useSelectionStore(selectedBytes)
  const clear = useSelectionStore((state) => state.clear)
  const current = useScanStore(currentDirectory)
  const actions = useFileActions()

  if (selected.size === 0) return null

  const nodes = [...selected.values()]
  const scope = current ? childTotal(current) : selectionTotal
  const folderCount = nodes.filter((node) => node.type === 'directory').length

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4">
      <div className="pointer-events-auto flex w-full max-w-[620px] animate-slide-up items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 shadow-2xl backdrop-blur-2xl">
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold">
            {formatItems(selected.size, 'item')} selected
            {folderCount > 0 ? ` (${folderCount} folders)` : ''}
          </p>
          <p className="text-label tabular-nums text-[var(--text-secondary)]">
            {formatBytes(selectionTotal)}
            {scope > 0 ? ` · ${formatPercent(selectionTotal, scope)} of ${current?.name ?? 'scan'}` : ''}
          </p>
        </div>

        <Button
          variant="secondary"
          icon={Trash2}
          onClick={() => void actions.moveToTrash(nodes)}
          title="Move the selected items to the Trash"
        >
          Move to Trash
        </Button>

        <Button
          variant="danger"
          icon={Eraser}
          onClick={() => void actions.deletePermanently(nodes)}
          title="Delete the selected items permanently"
        >
          Delete
        </Button>

        <button
          type="button"
          aria-label="Clear selection (Esc)"
          onClick={clear}
          className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
