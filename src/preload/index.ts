import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '@shared/types'
import type {
  AppInfo,
  DiskAPI,
  DiskInfo,
  DiskNode,
  DuplicateGroup,
  DuplicateProgress,
  FileInfo,
  FileOpResult,
  PermissionStatus,
  ScanProgress,
  SearchOptions,
  SmartSearchResult
} from '@shared/types'

/**
 * Subscribes to a main→renderer channel and returns an unsubscribe function.
 * Every caller of the `on*` methods is responsible for calling the returned
 * function on unmount — that is what keeps listeners from leaking.
 */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const diskAPI: DiskAPI = {
  // ---------------------------------------------------------------- disk
  listDisks: () => ipcRenderer.invoke(IPC.diskList) as Promise<DiskInfo[]>,
  getDiskInfo: (mountPoint) =>
    ipcRenderer.invoke(IPC.diskInfo, mountPoint) as Promise<DiskInfo>,

  // --------------------------------------------------------------- scans
  startScan: (path) => {
    ipcRenderer.send(IPC.scanStart, path)
  },
  cancelScan: () => {
    ipcRenderer.send(IPC.scanCancel)
  },
  onScanProgress: (cb) => subscribe<ScanProgress>(IPC.scanProgress, cb),
  onScanComplete: (cb) => subscribe<DiskNode>(IPC.scanComplete, cb),
  onScanError: (cb) => subscribe<string>(IPC.scanError, cb),

  // ------------------------------------------------------ file operations
  revealInFinder: (path) => ipcRenderer.invoke(IPC.fileReveal, path) as Promise<void>,
  moveToTrash: (paths) => ipcRenderer.invoke(IPC.fileTrash, paths) as Promise<FileOpResult>,
  deleteFiles: (paths) => ipcRenderer.invoke(IPC.fileDelete, paths) as Promise<FileOpResult>,
  getFileInfo: (path) => ipcRenderer.invoke(IPC.fileInfo, path) as Promise<FileInfo>,
  quickLook: (path) => ipcRenderer.invoke(IPC.fileQuickLook, path) as Promise<void>,

  // ---------------------------------------------------------- duplicates
  findDuplicates: (rootPath) =>
    ipcRenderer.invoke(IPC.dupesFind, rootPath) as Promise<DuplicateGroup[]>,
  onDuplicateProgress: (cb) => subscribe<DuplicateProgress>(IPC.dupesProgress, cb),

  // ------------------------------------------------------ App Uninstaller
  listApps: () => ipcRenderer.invoke(IPC.appsList) as Promise<AppInfo[]>,
  uninstallApp: (appPath, leftoverPaths) =>
    ipcRenderer.invoke(IPC.appsUninstall, appPath, leftoverPaths) as Promise<FileOpResult>,

  // ---------------------------------------------------------- Smart Search
  smartSearch: (options: SearchOptions) =>
    ipcRenderer.invoke(IPC.searchSmart, options) as Promise<SmartSearchResult[]>,


  // -------------------------------------------------------------- system
  openFolder: () => ipcRenderer.invoke(IPC.systemOpenFolder) as Promise<string | null>,
  platform: () => process.platform,
  checkPermissions: () =>
    ipcRenderer.invoke(IPC.systemPermissions) as Promise<PermissionStatus>,
  openFullDiskAccessSettings: () =>
    ipcRenderer.invoke(IPC.systemOpenFullDiskAccess) as Promise<void>,

  // -------------------------------------------------------------- export
  exportScan: (format, root) =>
    ipcRenderer.invoke(IPC.exportScan, format, root)
}

// contextIsolation is enabled in the BrowserWindow, which is the only setting
// this bridge is valid under.
contextBridge.exposeInMainWorld('diskAPI', diskAPI)
