import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type { DiskNode, DuplicateProgress, SearchOptions } from '@shared/types'
import { scanDirectory, ScanCancelledError } from './modules/scanner'
import { getDiskInfo, invalidateDiskCache, listDisks } from './modules/diskInfo'
import { deleteFiles, getFileInfo, moveToTrash, quickLook, revealInFinder } from './modules/fileOps'
import { checkPermissions, openFullDiskAccessSettings } from './modules/permissions'
import { findDuplicates } from './modules/duplicates'
import { exportScanResults } from './modules/export'
import { listInstalledApps, uninstallApp } from './modules/apps'
import { executeSmartSearch } from './modules/smartSearch'

let activeScan: AbortController | null = null
let activeDuplicateScan: AbortController | null = null

/** Pushes a message to every renderer that is still alive. */
function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

export function registerIpcHandlers(): void {
  // ---------------------------------------------------------------- disks
  ipcMain.handle(IPC.diskList, () => listDisks())
  ipcMain.handle(IPC.diskInfo, (_event, mountPoint: string) => getDiskInfo(mountPoint))

  // --------------------------------------------------------------- scans
  ipcMain.on(IPC.scanStart, (_event, root: string) => {
    // A scan already running is replaced by the new one.
    activeScan?.abort()

    const controller = new AbortController()
    activeScan = controller

    void (async () => {
      try {
        const tree = await scanDirectory({
          root,
          signal: controller.signal,
          onProgress: (progress) => broadcast(IPC.scanProgress, progress)
        })
        if (!controller.signal.aborted) broadcast(IPC.scanComplete, tree)
      } catch (err) {
        if (err instanceof ScanCancelledError || controller.signal.aborted) return
        broadcast(IPC.scanError, err instanceof Error ? err.message : String(err))
      } finally {
        if (activeScan === controller) activeScan = null
      }
    })()
  })

  // -------------------------------------------------------- App Uninstaller
  ipcMain.handle(IPC.appsList, () => listInstalledApps())
  ipcMain.handle(IPC.appsUninstall, (_event, appPath: string, leftoverPaths: string[]) =>
    uninstallApp(appPath, leftoverPaths)
  )

  // ---------------------------------------------------------- Smart Search
  ipcMain.handle(IPC.searchSmart, (_event, options: SearchOptions) => executeSmartSearch(options))


  ipcMain.on(IPC.scanCancel, () => {
    activeScan?.abort()
    activeScan = null
  })

  // -------------------------------------------------------- file operations
  ipcMain.handle(IPC.fileReveal, (_event, target: string) => revealInFinder(target))
  ipcMain.handle(IPC.fileTrash, (_event, paths: string[]) => moveToTrash(paths))
  ipcMain.handle(IPC.fileDelete, (_event, paths: string[]) => deleteFiles(paths))
  ipcMain.handle(IPC.fileInfo, (_event, target: string) => getFileInfo(target))
  ipcMain.handle(IPC.fileQuickLook, (_event, target: string) => quickLook(target))

  // ---------------------------------------------------------- duplicates
  ipcMain.handle(IPC.dupesFind, async (_event, root: string) => {
    activeDuplicateScan?.abort()

    const controller = new AbortController()
    activeDuplicateScan = controller

    try {
      return await findDuplicates({
        root,
        signal: controller.signal,
        onProgress: (progress: DuplicateProgress) => broadcast(IPC.dupesProgress, progress)
      })
    } finally {
      if (activeDuplicateScan === controller) activeDuplicateScan = null
    }
  })

  // -------------------------------------------------------------- system
  ipcMain.handle(IPC.systemOpenFolder, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a folder to scan',
      buttonLabel: 'Scan',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC.systemPermissions, () => checkPermissions())
  ipcMain.handle(IPC.systemOpenFullDiskAccess, () => openFullDiskAccessSettings())

  // -------------------------------------------------------------- export
  ipcMain.handle(IPC.exportScan, (_event, format: 'csv' | 'json', root: DiskNode) =>
    exportScanResults(format, root)
  )
}

/**
 * Aborts in-flight work. Called when the app quits so no scan keeps walking
 * the filesystem after the window is gone.
 */
export function cancelAllWork(): void {
  activeScan?.abort()
  activeScan = null
  activeDuplicateScan?.abort()
  activeDuplicateScan = null
}

export { invalidateDiskCache }
