import { create } from 'zustand'
import type {
  ColorMode,
  DiskInfo,
  DiskNode,
  PermissionStatus,
  ScanProgress,
  SortDirection,
  SortKey,
  ViewMode
} from '@shared/types'
import { findPathTrail, removePaths, resolveStack } from '@renderer/utils/tree'

const HISTORY_KEY = 'disklens.scanHistory'
const MAX_HISTORY = 5

function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .slice(0, MAX_HISTORY)
  } catch {
    // localStorage can be unavailable; scan history is a convenience only.
    return []
  }
}

function writeHistory(entries: string[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // Ignore quota/serialisation failures.
  }
}

export interface ScanState {
  // ------------------------------------------------------------- data
  disks: DiskInfo[]
  root: DiskNode | null
  scanPath: string | null

  // ----------------------------------------------------------- status
  scanning: boolean
  progress: ScanProgress | null
  error: string | null
  /** Transient, non-fatal message (a failed delete, an unreadable file). */
  notice: string | null
  permissions: PermissionStatus | null

  // ------------------------------------------------------- navigation
  /** Root → current drill-down trail. `[]` means "no scan yet". */
  pathStack: DiskNode[]

  // ------------------------------------------------------------ view
  view: ViewMode
  sortKey: SortKey
  sortDirection: SortDirection
  filter: string
  colorMode: ColorMode

  history: string[]

  // ---------------------------------------------------------- actions
  loadDisks: () => Promise<void>
  refreshPermissions: () => Promise<void>

  startScan: (path: string) => void
  cancelScan: () => void
  rescan: () => void
  applyProgress: (progress: ScanProgress) => void
  applyComplete: (root: DiskNode) => void
  applyError: (message: string) => void
  clearError: () => void
  setNotice: (notice: string | null) => void
  clearScan: () => void

  drillInto: (node: DiskNode) => void
  zoomTo: (index: number) => void
  zoomOut: () => void
  zoomToRoot: () => void
  navigateToPath: (targetPath: string) => void

  setView: (view: ViewMode) => void
  setSort: (key: SortKey) => void
  setFilter: (filter: string) => void
  setColorMode: (mode: ColorMode) => void

  /** Removes deleted items from the in-memory tree without a rescan. */
  dropPaths: (paths: string[]) => void
}

export const useScanStore = create<ScanState>((set, get) => ({
  disks: [],
  root: null,
  scanPath: null,

  scanning: false,
  progress: null,
  error: null,
  notice: null,
  permissions: null,

  pathStack: [],

  view: 'treemap',
  sortKey: 'size',
  sortDirection: 'desc',
  filter: '',
  colorMode: 'folder',

  history: readHistory(),

  loadDisks: async () => {
    try {
      const disks = await window.diskAPI.listDisks()
      set({ disks })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshPermissions: async () => {
    try {
      const permissions = await window.diskAPI.checkPermissions()
      set({ permissions })
    } catch {
      set({ permissions: { fullDiskAccess: true } })
    }
  },

  startScan: (path) => {
    const history = [path, ...get().history.filter((entry) => entry !== path)].slice(
      0,
      MAX_HISTORY
    )
    writeHistory(history)

    set({
      scanning: true,
      error: null,
      notice: null,
      progress: {
        scannedFiles: 0,
        scannedDirs: 0,
        currentPath: path,
        bytesFound: 0
      },
      scanPath: path,
      pathStack: [],
      filter: '',
      history
    })

    window.diskAPI.startScan(path)
  },

  cancelScan: () => {
    window.diskAPI.cancelScan()
    set({ scanning: false, progress: null })
  },

  rescan: () => {
    const { scanPath } = get()
    if (scanPath) get().startScan(scanPath)
  },

  applyProgress: (progress) => set({ progress }),

  applyComplete: (root) => {
    set({
      root,
      scanPath: root.path,
      pathStack: [root],
      scanning: false,
      progress: null,
      error: null
    })
    // Volume free space changed as a side effect of the scan's freshness.
    void get().loadDisks()
  },

  applyError: (message) => set({ scanning: false, progress: null, error: message }),

  clearError: () => set({ error: null }),

  setNotice: (notice) => set({ notice }),

  clearScan: () =>
    set({ root: null, pathStack: [], scanPath: null, error: null, progress: null }),

  drillInto: (node) => {
    if (node.type !== 'directory') return
    const { root, pathStack } = get()
    if (!root) return
    if (node.id === root.id) {
      set({ pathStack: [root] })
      return
    }
    const index = pathStack.findIndex((entry) => entry.id === node.id)
    if (index >= 0) {
      set({ pathStack: pathStack.slice(0, index + 1) })
      return
    }
    set({ pathStack: [...pathStack, node] })
  },

  zoomTo: (index) => {
    const { pathStack } = get()
    if (index < 0 || index >= pathStack.length) return
    set({ pathStack: pathStack.slice(0, index + 1) })
  },

  zoomOut: () => {
    const { pathStack } = get()
    if (pathStack.length <= 1) return
    set({ pathStack: pathStack.slice(0, -1) })
  },

  zoomToRoot: () => {
    const { root } = get()
    if (root) set({ pathStack: [root] })
  },

  navigateToPath: (targetPath) => {
    const { root } = get()
    if (!root) return
    const trail = findPathTrail(root, targetPath)
    if (!trail || trail.length === 0) return
    const dirStack = trail.filter((n) => n.type === 'directory')
    set({ pathStack: dirStack.length > 0 ? dirStack : [root] })
  },

  setView: (view) => set({ view }),

  setSort: (key) => {
    const { sortKey, sortDirection } = get()
    if (sortKey === key) {
      set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' })
      return
    }
    // Size and date read best largest/newest first.
    set({ sortKey: key, sortDirection: key === 'name' ? 'asc' : 'desc' })
  },

  setFilter: (filter) => set({ filter }),

  setColorMode: (colorMode) => set({ colorMode }),

  dropPaths: (paths) => {
    const { root, pathStack } = get()
    if (!root || paths.length === 0) return

    const nextRoot = removePaths(root, paths)
    // The drill-down stack holds stale node references now; re-resolve by path.
    const nextStack = resolveStack(
      nextRoot,
      pathStack.map((node) => node.path)
    )

    set({
      root: nextRoot,
      pathStack: nextStack.length > 0 ? nextStack : [nextRoot]
    })
  }
}))

/** The directory currently in focus: the deepest node on the drill-down trail. */
export function currentDirectory(state: ScanState): DiskNode | null {
  if (state.pathStack.length > 0) {
    return state.pathStack[state.pathStack.length - 1] ?? null
  }
  return state.root
}

/** The volume that contains the current scan, used by the disk bar. */
export function activeDisk(state: ScanState): DiskInfo | null {
  const { disks, scanPath } = state
  if (disks.length === 0) return null
  if (!scanPath) return disks.find((disk) => disk.mountPoint === '/') ?? disks[0] ?? null

  let best: DiskInfo | null = null
  for (const disk of disks) {
    const isInside =
      scanPath === disk.mountPoint || scanPath.startsWith(`${disk.mountPoint.replace(/\/$/, '')}/`)
    if (!isInside) continue
    if (!best || disk.mountPoint.length > best.mountPoint.length) best = disk
  }
  return best ?? disks.find((disk) => disk.mountPoint === '/') ?? disks[0] ?? null
}
