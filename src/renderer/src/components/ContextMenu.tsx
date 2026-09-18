import { useEffect, useMemo, useRef } from 'react'
import { Eraser, Eye, FolderSearch, Info, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DiskNode } from '@shared/types'
import { useFileActions } from '@renderer/hooks/useFileActions'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { formatBytes, formatItems } from '@renderer/utils/formatBytes'
import { FileIcon } from './FileIcon'

const MENU_WIDTH = 244
const MENU_HEIGHT = 236

interface MenuItemProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  destructive?: boolean
  onSelect: () => void
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  destructive = false,
  onSelect
}: MenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`mac-ease flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body transition-colors duration-100 ${
        destructive
          ? 'text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white'
          : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="flex-1 truncate">{label}</span>
      {shortcut ? (
        <span className="text-label text-[var(--text-tertiary)]">{shortcut}</span>
      ) : null}
    </button>
  )
}

function Divider(): JSX.Element {
  return <div className="my-1 h-px bg-[var(--border)]" />
}

export function ContextMenu(): JSX.Element | null {
  const menu = useUiStore((state) => state.contextMenu)
  const closeMenu = useUiStore((state) => state.closeContextMenu)
  const selected = useSelectionStore((state) => state.selected)
  const actions = useFileActions()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return undefined

    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }

    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('resize', closeMenu)

    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('resize', closeMenu)
    }
  }, [menu, closeMenu])

  /**
   * Right-clicking inside an existing multi-selection acts on the whole
   * selection; right-clicking anywhere else acts on the clicked item only.
   */
  const targets = useMemo<DiskNode[]>(() => {
    if (!menu) return []
    if (selected.size > 1 && selected.has(menu.node.path)) {
      return [...selected.values()]
    }
    return [menu.node]
  }, [menu, selected])

  if (!menu) return null

  const node = menu.node
  const isDirectory = node.type === 'directory'
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - MENU_HEIGHT - 8))

  const run = (fn: () => void) => (): void => {
    closeMenu()
    fn()
  }

  return (
    <div
      ref={containerRef}
      role="menu"
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-50 animate-scale-in rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl backdrop-blur-2xl"
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <FileIcon node={node} className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{node.name}</p>
          <p className="truncate text-label text-[var(--text-tertiary)]">
            {formatBytes(node.size)}
            {targets.length > 1 ? ` · ${formatItems(targets.length, 'item')} selected` : ''}
          </p>
        </div>
      </div>

      <Divider />

      <MenuItem icon={Eye} label="Quick Look" shortcut="Space" onSelect={run(() => actions.quickLook(node))} />
      <MenuItem
        icon={FolderSearch}
        label="Reveal in Finder"
        onSelect={run(() => actions.reveal(node))}
      />
      <MenuItem icon={Info} label="Get Info" onSelect={run(() => void actions.showInfo(node))} />

      {isDirectory ? (
        <>
          <Divider />
          <MenuItem
            icon={FolderSearch}
            label="Scan This Folder"
            onSelect={run(() => actions.scanFolder(node))}
          />
        </>
      ) : null}

      <Divider />

      <MenuItem
        icon={Trash2}
        label={targets.length > 1 ? `Move ${targets.length} Items to Trash` : 'Move to Trash'}
        shortcut="⌘⌫"
        onSelect={run(() => void actions.moveToTrash(targets))}
      />
      <MenuItem
        icon={Eraser}
        label={targets.length > 1 ? `Delete ${targets.length} Items Permanently` : 'Delete Permanently'}
        destructive
        onSelect={run(() => void actions.deletePermanently(targets))}
      />
    </div>
  )
}
