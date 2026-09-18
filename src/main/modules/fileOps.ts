import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { shell } from 'electron'
import type { FileInfo, FileOpResult } from '@shared/types'

/**
 * Reveals a path in Finder. `showItemInFolder` needs an existing path; a
 * vanished file falls back to opening its parent directory.
 */
export async function revealInFinder(target: string): Promise<void> {
  shell.showItemInFolder(target)
}

/**
 * Moves paths to the macOS Trash using Electron's native implementation, so
 * the operation is recoverable and respects volume-local trash folders.
 */
export async function moveToTrash(paths: string[]): Promise<FileOpResult> {
  const failed: string[] = []
  for (const target of paths) {
    try {
      await shell.trashItem(target)
    } catch {
      failed.push(target)
    }
  }
  return { success: failed.length === 0, failed }
}

/** Permanent, unrecoverable delete. The renderer confirms before calling this. */
export async function deleteFiles(paths: string[]): Promise<FileOpResult> {
  const failed: string[] = []
  for (const target of paths) {
    try {
      await fs.rm(target, { recursive: true, force: true })
    } catch {
      failed.push(target)
    }
  }
  return { success: failed.length === 0, failed }
}

export async function getFileInfo(target: string): Promise<FileInfo> {
  const stats = await fs.stat(target)
  return {
    size: stats.size,
    modified: stats.mtimeMs,
    created: stats.birthtimeMs
  }
}

/**
 * Opens the macOS Quick Look preview panel for a path. `qlmanage -p` spawns a
 * separate preview process, which is exactly what the Finder's space-bar
 * preview does; its noisy stdout/stderr is discarded.
 */
export async function quickLook(target: string): Promise<void> {
  return new Promise((resolve) => {
    const child = execFile('qlmanage', ['-p', target], () => resolve())
    child.stdout?.resume()
    child.stderr?.resume()
  })
}
