import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { shell } from 'electron'
import type { AppInfo, AppLeftoverCategory, AppLeftoverItem, FileOpResult } from '@shared/types'

/** Fast recursive directory size calculator */
async function getDirectorySize(dirPath: string): Promise<number> {
  let total = 0
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          total += await getDirectorySize(fullPath)
        } else {
          const stats = await fs.lstat(fullPath)
          total += stats.size
        }
      } catch {
        // Ignore unreadable files
      }
    }
  } catch {
    try {
      const stats = await fs.lstat(dirPath)
      return stats.size
    } catch {
      return 0
    }
  }
  return total
}

/** Extracts string value for a key from an Info.plist XML buffer */
function extractPlistValue(plistContent: string, key: string): string | undefined {
  const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`, 'i')
  const match = regex.exec(plistContent)
  return match ? match[1].trim() : undefined
}

/** Scans common ~/Library locations for leftover files related to an app */
async function findAppLeftovers(
  homeDir: string,
  bundleId: string | undefined,
  appName: string
): Promise<AppLeftoverItem[]> {
  const leftovers: AppLeftoverItem[] = []
  const lib = path.join(homeDir, 'Library')

  // Search patterns based on bundleId and appName (case-insensitive checks)
  const normalizedAppName = appName.toLowerCase().replace(/\.app$/i, '').trim()
  const bundleFragments = bundleId ? bundleId.toLowerCase().split('.').filter(Boolean) : []
  const lastBundlePart = bundleFragments[bundleFragments.length - 1]

  function matchesApp(filename: string): boolean {
    const lower = filename.toLowerCase()
    if (bundleId && lower.includes(bundleId.toLowerCase())) return true
    if (lower === normalizedAppName || lower.startsWith(`${normalizedAppName}.`)) return true
    if (lastBundlePart && lastBundlePart.length > 3 && lower === lastBundlePart) return true
    return false
  }

  const searchLocations: Array<{
    dir: string
    category: AppLeftoverCategory
    isFile?: boolean
  }> = [
    { dir: path.join(lib, 'Application Support'), category: 'appSupport' },
    { dir: path.join(lib, 'Caches'), category: 'caches' },
    { dir: path.join(lib, 'Preferences'), category: 'preferences', isFile: true },
    { dir: path.join(lib, 'Saved Application State'), category: 'savedState' },
    { dir: path.join(lib, 'Containers'), category: 'containers' },
    { dir: path.join(lib, 'Logs'), category: 'logs' },
    { dir: path.join(lib, 'WebKit'), category: 'other' },
    { dir: path.join(lib, 'HTTPStorages'), category: 'other' }
  ]

  for (const loc of searchLocations) {
    try {
      const entries = await fs.readdir(loc.dir, { withFileTypes: true })
      for (const entry of entries) {
        if (matchesApp(entry.name)) {
          const fullPath = path.join(loc.dir, entry.name)
          const size = await getDirectorySize(fullPath)
          leftovers.push({
            path: fullPath,
            name: entry.name,
            size,
            category: loc.category
          })
        }
      }
    } catch {
      // Directory may not exist or be permission-restricted
    }
  }

  return leftovers
}

/** Lists all applications in /Applications and ~/Applications */
export async function listInstalledApps(): Promise<AppInfo[]> {
  const homeDir = os.homedir()
  const appDirs = ['/Applications', path.join(homeDir, 'Applications')]
  const apps: AppInfo[] = []

  for (const appDir of appDirs) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(appDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.endsWith('.app')) continue
      const appPath = path.join(appDir, entry)

      try {
        const stats = await fs.lstat(appPath)
        if (!stats.isDirectory()) continue

        const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist')
        let bundleId: string | undefined
        let displayName: string | undefined
        let version: string | undefined

        try {
          const plistContent = await fs.readFile(infoPlistPath, 'utf8')
          bundleId = extractPlistValue(plistContent, 'CFBundleIdentifier')
          displayName =
            extractPlistValue(plistContent, 'CFBundleDisplayName') ||
            extractPlistValue(plistContent, 'CFBundleName')
          version = extractPlistValue(plistContent, 'CFBundleShortVersionString')
        } catch {
          // Info.plist may be missing or binary format
        }

        const name = displayName || entry.replace(/\.app$/, '')
        const isSystemApp = appPath.startsWith('/System') || Boolean(bundleId?.startsWith('com.apple.'))

        const appSize = await getDirectorySize(appPath)
        const leftovers = await findAppLeftovers(homeDir, bundleId, name)
        const leftoverSize = leftovers.reduce((acc, item) => acc + item.size, 0)

        apps.push({
          id: appPath,
          name,
          bundleId,
          version,
          appPath,
          appSize,
          leftoverSize,
          totalSize: appSize + leftoverSize,
          isSystemApp,
          leftovers
        })
      } catch {
        // Skip inaccessible apps
      }
    }
  }

  return apps.sort((a, b) => b.totalSize - a.totalSize)
}

/** Prompts native macOS Touch ID / Password dialog to remove elevated or root-owned items */
async function removeWithAdminPrivileges(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true
  const escapedPaths = paths.map((p) => `\\\"${p.replace(/["\\]/g, '\\$&')}\\\"`).join(' ')
  const script = `do shell script "rm -rf ${escapedPaths}" with administrator privileges`

  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], (err) => {
      resolve(!err)
    })
  })
}

/** Removes a single item or container safely */
async function deleteItemSafely(itemPath: string): Promise<boolean> {
  try {
    await fs.lstat(itemPath)
  } catch {
    return true
  }

  // 1. If it's a sandboxed container in ~/Library/Containers, macOS protects the root
  // .com.apple.containermanagerd.metadata.plist, but permits clearing all data contents
  if (itemPath.includes('Library/Containers')) {
    try {
      const entries = await fs.readdir(itemPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.com.apple.containermanagerd')) continue
        const childPath = path.join(itemPath, entry.name)
        try {
          await fs.rm(childPath, { recursive: true, force: true })
        } catch {
          // ignore locked files
        }
      }
      return true
    } catch {
      // Fall through to standard deletion
    }
  }

  // 2. Try standard macOS shell.trashItem (moves to Trash)
  try {
    await shell.trashItem(itemPath)
    return true
  } catch {
    // shell.trashItem failed
  }

  // 3. Try direct fs.rm
  try {
    await fs.rm(itemPath, { recursive: true, force: true })
    return true
  } catch {
    // Requires elevation
  }

  return false
}

/** Uninstalls an application and removes selected leftover paths to Trash */
export async function uninstallApp(
  appPath: string,
  leftoverPaths: string[]
): Promise<FileOpResult> {
  const failed: string[] = []

  // 1. Process all leftovers
  for (const itemPath of leftoverPaths) {
    const success = await deleteItemSafely(itemPath)
    if (!success) {
      failed.push(itemPath)
    }
  }

  // 2. Process the main app bundle
  const appSuccess = await deleteItemSafely(appPath)
  if (!appSuccess) {
    failed.push(appPath)
  }

  // 3. If any items failed (e.g. root-owned /Applications/*.app or protected container),
  // request elevation via standard macOS Touch ID / administrator prompt
  if (failed.length > 0) {
    const adminSuccess = await removeWithAdminPrivileges(failed)
    if (adminSuccess) {
      return { success: true, failed: [] }
    }
  }

  return {
    success: failed.length === 0,
    failed
  }
}
