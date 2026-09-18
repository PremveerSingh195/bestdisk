import { create } from 'zustand'
import type { DiskNode } from '@shared/types'

/**
 * Multi-selection keyed by absolute path.
 *
 * A `Map` (rather than a `Set` of paths) is deliberate: the cleanup drawer and
 * the bottom bar need each selected node's size without walking the tree.
 */
export interface SelectionState {
  selected: Map<string, DiskNode>
  /** Path that Shift-click extends the range from. */
  anchorPath: string | null

  isSelected: (path: string) => boolean
  toggle: (node: DiskNode) => void
  add: (nodes: DiskNode[]) => void
  set: (nodes: DiskNode[]) => void
  remove: (paths: string[]) => void
  clear: () => void
  setAnchor: (path: string | null) => void
  /** Drops selections whose paths no longer exist after a delete. */
  retain: (paths: Iterable<string>) => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selected: new Map<string, DiskNode>(),
  anchorPath: null,

  isSelected: (path) => get().selected.has(path),

  toggle: (node) => {
    const next = new Map(get().selected)
    if (next.has(node.path)) next.delete(node.path)
    else next.set(node.path, node)
    set({ selected: next, anchorPath: node.path })
  },

  add: (nodes) => {
    const next = new Map(get().selected)
    for (const node of nodes) next.set(node.path, node)
    set({ selected: next })
  },

  set: (nodes) => {
    set({ selected: new Map(nodes.map((node) => [node.path, node])) })
  },

  remove: (paths) => {
    const next = new Map(get().selected)
    for (const path of paths) next.delete(path)
    set({ selected: next })
  },

  clear: () => set({ selected: new Map<string, DiskNode>(), anchorPath: null }),

  setAnchor: (anchorPath) => set({ anchorPath }),

  retain: (paths) => {
    const allowed = paths instanceof Set ? paths : new Set(paths)
    const next = new Map<string, DiskNode>()
    for (const [path, node] of get().selected) {
      if (allowed.has(path)) next.set(path, node)
    }
    if (next.size === get().selected.size) return
    set({ selected: next })
  }
}))

/** Total bytes currently selected. */
export function selectedBytes(state: SelectionState): number {
  let total = 0
  for (const node of state.selected.values()) total += node.size
  return total
}
