import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { shell } from 'electron'
import type { PermissionStatus } from '@shared/types'

/**
 * Locations macOS protects behind the Full Disk Access TCC permission. If any
 * of them is present but returns EPERM/EACCES we know the user has not granted
 * the permission yet.
 */
const SENTINELS = [
  'Library/Application Support/com.apple.TCC',
  'Library/Safari',
  'Library/Cookies',
  'Library/Mail'
]

/**
 * Probes whether the app can read protected locations.
 *
 * Note: macOS offers no public API to query Full Disk Access directly
 * (`systemPreferences.getMediaAccessStatus` only covers camera, microphone and
 * screen recording), so a filesystem probe is the supported approach.
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  const home = os.homedir()

  for (const relative of SENTINELS) {
    const target = path.join(home, relative)
    try {
      await fs.readdir(target)
      return { fullDiskAccess: true }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      // ENOENT just means this Mac does not have that folder — try the next.
      if (code === 'EACCES' || code === 'EPERM') {
        return { fullDiskAccess: false, probedPath: target }
      }
    }
  }

  return { fullDiskAccess: true }
}

/** Deep-links to System Settings → Privacy & Security → Full Disk Access. */
export async function openFullDiskAccessSettings(): Promise<void> {
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
  )
}
