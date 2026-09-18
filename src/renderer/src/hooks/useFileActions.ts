import { useCallback, useMemo } from 'react'
import type { DiskNode } from '@shared/types'
import { useConfirm } from '@renderer/components/Dialogs'
import { useScanStore } from '@renderer/stores/useScanStore'
import { useSelectionStore } from '@renderer/stores/useSelectionStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { formatBytes, formatItems } from '@renderer/utils/formatBytes'

export interface FileActions {
  reveal: (node: DiskNode) => void
  quickLook: (node: DiskNode) => void
  showInfo: (node: DiskNode) => Promise<void>
  moveToTrash: (nodes: DiskNode[]) => Promise<void>
  deletePermanently: (nodes: DiskNode[]) => Promise<void>
  /** Path-based variants, used where only paths are available (duplicates). */
  trashPaths: (paths: string[], totalBytes: number) => Promise<void>
  deletePaths: (paths: string[], totalBytes: number) => Promise<void>
  scanFolder: (node: DiskNode) => void
}

function totalSize(nodes: DiskNode[]): number {
  return nodes.reduce((sum, node) => sum + node.size, 0)
}

/**
 * Every destructive or Finder-facing action in one place, so the context menu,
 * the cleanup drawer, the duplicates panel and the large-files panel all
 * confirm, report failures and refresh the tree identically.
 */
export function useFileActions(): FileActions {
  const confirm = useConfirm()

  const startScan = useScanStore((state) => state.startScan)
  const dropPaths = useScanStore((state) => state.dropPaths)
  const loadDisks = useScanStore((state) => state.loadDisks)
  const setNotice = useScanStore((state) => state.setNotice)

  const removeFromSelection = useSelectionStore((state) => state.remove)
  const clearSelection = useSelectionStore((state) => state.clear)

  const showLiveInfo = useUiStore((state) => state.showLiveInfo)

  const reveal = useCallback((node: DiskNode): void => {
    void window.diskAPI.revealInFinder(node.path)
  }, [])

  const quickLook = useCallback((node: DiskNode): void => {
    void window.diskAPI.quickLook(node.path)
  }, [])

  const showInfo = useCallback(
    async (node: DiskNode): Promise<void> => {
      try {
        const info = await window.diskAPI.getFileInfo(node.path)
        showLiveInfo(node.path, info)
      } catch {
        setNotice(`Could not read information for ${node.name}.`)
      }
    },
    [setNotice, showLiveInfo]
  )

  const trashPaths = useCallback(
    async (paths: string[], bytes: number): Promise<void> => {
      if (paths.length === 0) return

      const approved = await confirm({
        title: `Move ${formatItems(paths.length, 'item')} to the Trash?`,
        message: `${formatBytes(bytes)} will be moved to the Trash, where you can still restore ${
          paths.length === 1 ? 'it' : 'them'
        }.`,
        confirmLabel: 'Move to Trash'
      })
      if (!approved) return

      const result = await window.diskAPI.moveToTrash(paths)
      const succeeded = paths.filter((path) => !result.failed.includes(path))

      if (succeeded.length > 0) {
        dropPaths(succeeded)
        removeFromSelection(succeeded)
      }
      if (result.failed.length > 0) {
        setNotice(`${formatItems(result.failed.length, 'item')} could not be moved to the Trash.`)
      }
      void loadDisks()
    },
    [confirm, dropPaths, loadDisks, removeFromSelection, setNotice]
  )

  const deletePaths = useCallback(
    async (paths: string[], bytes: number): Promise<void> => {
      if (paths.length === 0) return

      const approved = await confirm({
        title: `Permanently delete ${formatItems(paths.length, 'item')}?`,
        message: `${formatBytes(bytes)} will be deleted immediately. This cannot be undone.`,
        confirmLabel: 'Delete Permanently',
        destructive: true
      })
      if (!approved) return

      const result = await window.diskAPI.deleteFiles(paths)
      const succeeded = paths.filter((path) => !result.failed.includes(path))

      if (succeeded.length > 0) {
        dropPaths(succeeded)
        removeFromSelection(succeeded)
      }
      if (result.failed.length > 0) {
        setNotice(`${formatItems(result.failed.length, 'item')} could not be deleted.`)
      }
      if (succeeded.length === paths.length) clearSelection()
      void loadDisks()
    },
    [clearSelection, confirm, dropPaths, loadDisks, removeFromSelection, setNotice]
  )

  const moveToTrash = useCallback(
    (nodes: DiskNode[]): Promise<void> =>
      trashPaths(
        nodes.map((node) => node.path),
        totalSize(nodes)
      ),
    [trashPaths]
  )

  const deletePermanently = useCallback(
    (nodes: DiskNode[]): Promise<void> =>
      deletePaths(
        nodes.map((node) => node.path),
        totalSize(nodes)
      ),
    [deletePaths]
  )

  const scanFolder = useCallback(
    (node: DiskNode): void => {
      if (node.type !== 'directory') return
      startScan(node.path)
    },
    [startScan]
  )

  return useMemo(
    () => ({
      reveal,
      quickLook,
      showInfo,
      moveToTrash,
      deletePermanently,
      trashPaths,
      deletePaths,
      scanFolder
    }),
    [
      deletePaths,
      deletePermanently,
      moveToTrash,
      quickLook,
      reveal,
      scanFolder,
      showInfo,
      trashPaths
    ]
  )
}
