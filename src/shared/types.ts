/**
 * Types shared between the Electron main process, the preload bridge and the
 * React renderer. This file must stay free of Node and DOM specific imports so
 * it can be compiled into every bundle.
 */

export interface DiskNode {
  /** Unique, path-based id — also used as the D3 data join key. */
  id: string
  name: string
  path: string
  /** Bytes. For directories this is the recursively rolled-up size. */
  size: number
  type: 'file' | 'directory'
  extension?: string
  category?: FileCategory
  children?: DiskNode[]
  /** Date.now() timestamp */
  modifiedAt?: number
  isSymlink?: boolean
}

export type FileCategory =
  | 'Applications'
  | 'Documents'
  | 'Images'
  | 'Videos'
  | 'Audio'
  | 'Archives'
  | 'Development'
  | 'System'
  | 'Other'

export interface DiskInfo {
  mountPoint: string
  label: string
  /** Bytes */
  total: number
  /** Bytes */
  used: number
  /** Bytes */
  free: number
  model?: string
  isRemovable?: boolean
  filesystem?: string
}

export interface ScanProgress {
  scannedFiles: number
  scannedDirs: number
  currentPath: string
  bytesFound: number
}

export type ViewMode = 'sunburst' | 'treemap' | 'list'
export type SortKey = 'size' | 'name' | 'modified' | 'type'
export type SortDirection = 'asc' | 'desc'
/** Drives the chart colour ramp. */
export type ColorMode = 'folder' | 'category' | 'size' | 'age'

export interface DuplicateGroup {
  hash: string
  size: number
  /** File paths. */
  files: string[]
}

export interface FileInfo {
  size: number
  modified: number
  created: number
}

export interface FileOpResult {
  success: boolean
  failed: string[]
}

export interface DuplicateProgress {
  stage: 'sizing' | 'partial-hash' | 'full-hash' | 'done'
  processed: number
  total: number
}

export interface PermissionStatus {
  /** False when macOS is blocking reads of protected locations. */
  fullDiskAccess: boolean
  /** Path that failed the probe, useful for explaining the problem. */
  probedPath?: string
}

// ------------------------------------------------------------- App Uninstaller
export type AppLeftoverCategory =
  | 'appSupport'
  | 'caches'
  | 'preferences'
  | 'savedState'
  | 'containers'
  | 'logs'
  | 'other'

export interface AppLeftoverItem {
  path: string
  name: string
  size: number
  category: AppLeftoverCategory
}

export interface AppInfo {
  id: string
  name: string
  bundleId?: string
  version?: string
  appPath: string
  appSize: number
  leftoverSize: number
  totalSize: number
  isSystemApp: boolean
  leftovers: AppLeftoverItem[]
}

// ------------------------------------------------------------- Smart Search
export type SearchScope = 'all' | 'home'
export type SearchKind = 'all' | 'apps' | 'docs' | 'media' | 'archives' | 'code'

export interface SearchOptions {
  query: string
  scope?: SearchScope
  kind?: SearchKind
  minSize?: number // bytes
  limit?: number
}

export interface SmartSearchResult {
  path: string
  name: string
  size: number
  modifiedAt: number
  kind: string
  extension: string
}


/** Shape of `window.diskAPI`, exposed by the preload script. */
export interface DiskAPI {
  // Disk
  listDisks(): Promise<DiskInfo[]>
  getDiskInfo(mountPoint: string): Promise<DiskInfo>

  // Scanning
  startScan(path: string): void
  cancelScan(): void
  /** Returns an unsubscribe function. */
  onScanProgress(cb: (p: ScanProgress) => void): () => void
  onScanComplete(cb: (root: DiskNode) => void): () => void
  onScanError(cb: (message: string) => void): () => void

  // File operations
  revealInFinder(path: string): Promise<void>
  moveToTrash(paths: string[]): Promise<FileOpResult>
  deleteFiles(paths: string[]): Promise<FileOpResult>
  getFileInfo(path: string): Promise<FileInfo>
  /** Opens the macOS Quick Look panel for a path (`qlmanage -p`). */
  quickLook(path: string): Promise<void>

  // Duplicates
  findDuplicates(rootPath: string): Promise<DuplicateGroup[]>
  onDuplicateProgress(cb: (p: DuplicateProgress) => void): () => void

  // App Uninstaller
  listApps(): Promise<AppInfo[]>
  uninstallApp(appPath: string, leftoverPaths: string[]): Promise<FileOpResult>

  // Smart Search
  smartSearch(options: SearchOptions): Promise<SmartSearchResult[]>

  // System
  openFolder(): Promise<string | null>
  /** Resolved from `process.platform` in the preload, so it is synchronous. */
  platform(): string
  checkPermissions(): Promise<PermissionStatus>
  openFullDiskAccessSettings(): Promise<void>

  // Export
  exportScan(format: 'csv' | 'json', root: DiskNode): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>
}

/** IPC channel names, kept in one place so main and preload cannot drift. */
export const IPC = {
  diskList: 'disk:list',
  diskInfo: 'disk:info',

  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanProgress: 'scan:progress',
  scanComplete: 'scan:complete',
  scanError: 'scan:error',

  fileReveal: 'file:reveal',
  fileTrash: 'file:trash',
  fileDelete: 'file:delete',
  fileInfo: 'file:info',
  fileQuickLook: 'file:quickLook',

  dupesFind: 'dupes:find',
  dupesProgress: 'dupes:progress',

  appsList: 'apps:list',
  appsUninstall: 'apps:uninstall',

  searchSmart: 'search:smart',

  systemOpenFolder: 'system:openFolder',
  systemPermissions: 'system:permissions',
  systemOpenFullDiskAccess: 'system:openFullDiskAccess',

  exportScan: 'export:scan'
} as const

