import clsx from 'clsx'
import { Clock, Copy, Eye, FolderSearch, Info, Trash2, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DiskNode } from '@shared/types'
import { useFileActions } from '@renderer/hooks/useFileActions'
import { currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { selectedBytes, useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import type { RightTab } from '@renderer/stores/useUiStore'
import { CATEGORY_COLORS } from '@renderer/utils/categorize'
import { BUCKET_COLORS, BUCKET_LABELS, sizeBucket } from '@renderer/utils/colorScale'
import {
  formatBytes,
  formatDate,
  formatItems,
  formatPercent,
  formatRelativeDate
} from '@renderer/utils/formatBytes'
import { childCount, childTotal } from '@renderer/utils/tree'
import { Badge, Button, PanelHeader } from './Primitives'
import { CategoryBreakdown } from './CategoryBreakdown'
import { DuplicatesPanel } from './DuplicatesPanel'
import { FileIcon } from './FileIcon'
import { LargeFilesPanel } from './LargeFilesPanel'
import { OldFilesPanel } from './OldFilesPanel'

const TABS: Array<{ value: RightTab; label: string; icon: LucideIcon }> = [
  { value: 'details', label: 'Details', icon: Info },
  { value: 'largest', label: 'Largest', icon: TrendingUp },
  { value: 'duplicates', label: 'Dupes', icon: Copy },
  { value: 'old-files', label: 'Old Files', icon: Clock }
]

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-label text-[var(--text-tertiary)]">{label}</span>
      <span className="truncate text-body tabular-nums text-[var(--text-secondary)]" title={value}>
        {value}
      </span>
    </div>
  )
}

function FocusCard({ node, parentSize }: { node: DiskNode; parentSize: number }): JSX.Element {
  const liveInfo = useUiStore((state) => state.liveInfo)
  const actions = useFileActions()
  const bucket = sizeBucket(node.size)
  const live = liveInfo?.path === node.path ? liveInfo.info : null

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <FileIcon node={node} className="mt-0.5 h-4 w-4 text-[var(--text-secondary)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold" title={node.name}>
            {node.name}
          </p>
          <p
            data-selectable
            className="mt-0.5 break-all font-mono text-label text-[var(--text-tertiary)]"
          >
            {node.path}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge color={BUCKET_COLORS[bucket]}>{BUCKET_LABELS[bucket]}</Badge>
        {node.category ? (
          <Badge color={CATEGORY_COLORS[node.category]}>{node.category}</Badge>
        ) : null}
        {node.isSymlink ? <Badge>symlink</Badge> : null}
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] px-2 py-1.5">
        <InfoRow label="Size" value={formatBytes(node.size)} />
        {parentSize > 0 && node.size !== parentSize ? (
          <InfoRow label="Of parent" value={formatPercent(node.size, parentSize)} />
        ) : null}
        {node.type === 'directory' ? (
          <InfoRow label="Items" value={formatItems(childCount(node), 'item')} />
        ) : null}
        <InfoRow
          label="Modified"
          value={`${formatRelativeDate(node.modifiedAt)} · ${formatDate(node.modifiedAt)}`}
        />
        {live ? (
          <>
            <InfoRow label="Exact size" value={`${live.size.toLocaleString()} bytes`} />
            <InfoRow label="Created" value={formatDate(live.created)} />
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" icon={Eye} onClick={() => actions.quickLook(node)}>
          Quick Look
        </Button>
        <Button size="sm" variant="secondary" icon={FolderSearch} onClick={() => actions.reveal(node)}>
          Reveal
        </Button>
        <Button size="sm" variant="ghost" icon={Info} onClick={() => void actions.showInfo(node)}>
          Get Info
        </Button>
        {node.type === 'directory' ? (
          <Button size="sm" variant="ghost" onClick={() => actions.scanFolder(node)}>
            Scan this folder
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          onClick={() => void actions.moveToTrash([node])}
          className="text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white"
        >
          Trash
        </Button>
      </div>
    </div>
  )
}

export function DetailPanel(): JSX.Element {
  const current = useScanStore(currentDirectory)
  const root = useScanStore((state) => state.root)
  const hovered = useUiStore((state) => state.hovered)
  const rightTab = useUiStore((state) => state.rightTab)
  const setRightTab = useUiStore((state) => state.setRightTab)

  const selected = useSelectionStore((state) => state.selected)
  const selectionTotal = useSelectionStore(selectedBytes)

  // Hover wins (it is the most transient), then a single-item selection,
  // then whatever directory the user has drilled into.
  const singleSelection = selected.size === 1 ? ([...selected.values()][0] ?? null) : null
  const focus = hovered ?? singleSelection ?? current

  const parentSize = ((): number => {
    if (!focus || !current) return 0
    if (focus.path === current.path) return childTotal(current)
    if (focus.path.startsWith(current.path)) return childTotal(current)
    return root ? root.size : focus.size
  })()

  return (
    <aside className="relative z-10 flex w-[320px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-primary)] shadow-sm">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-glass)] px-2 py-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = tab.value === rightTab
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setRightTab(tab.value)}
              className={clsx(
                'mac-ease flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-label font-medium transition-colors duration-150',
                active
                  ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selected.size > 1 ? (
          <div className="mb-3 rounded-xl border border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 p-2.5">
            <p className="text-body font-medium">
              {formatItems(selected.size, 'item')} selected
            </p>
            <p className="text-label tabular-nums text-[var(--text-secondary)]">
              {formatBytes(selectionTotal)} — use the drawer at the bottom to act on them.
            </p>
          </div>
        ) : null}

        {rightTab === 'details' ? (
          <div className="space-y-4">
            {focus ? (
              <>
                <PanelHeader title={hovered ? 'Hovered' : 'Selected'} />
                <FocusCard node={focus} parentSize={parentSize} />
              </>
            ) : (
              <p className="text-body text-[var(--text-tertiary)]">
                Nothing selected. Hover a segment to inspect it.
              </p>
            )}

            {current ? (
              <>
                <div className="h-px bg-[var(--border)]" />
                <PanelHeader title="Categories" />
                <CategoryBreakdown node={current} />
              </>
            ) : null}
          </div>
        ) : null}

        {rightTab === 'largest' ? <LargeFilesPanel /> : null}
        {rightTab === 'duplicates' ? <DuplicatesPanel /> : null}
        {rightTab === 'old-files' ? <OldFilesPanel /> : null}
      </div>
    </aside>
  )
}
