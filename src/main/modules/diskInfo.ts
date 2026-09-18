import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import type { DiskInfo } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * OS-internal APFS volumes: real mount points, but not something a person ever
 * wants to browse or clean up.
 */
const HIDDEN_MOUNTS = new Set([
  '/dev',
  '/System/Volumes/VM',
  '/System/Volumes/Preboot',
  '/System/Volumes/Update',
  '/System/Volumes/xarts',
  '/System/Volumes/iSCPreboot',
  '/System/Volumes/Hardware',
  '/System/Volumes/Data',
  '/System/Volumes/Data/home'
])

const CACHE_TTL_MS = 2000
let cache: { at: number; disks: DiskInfo[] } | null = null

/**
 * Parses `df -kP` output. The POSIX `-P` flag guarantees one line per
 * filesystem with the mount point last, which is what makes it safe to parse
 * (mount points may contain spaces).
 */
export function parseDfOutput(stdout: string): DiskInfo[] {
  const disks: DiskInfo[] = []
  const lines = stdout.split('\n').slice(1)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split(/\s+/)
    if (parts.length < 6) continue

    const [device, blocksRaw, usedRaw, freeRaw, , ...mountParts] = parts
    const mountPoint = mountParts.join(' ')

    // On macOS every real volume is a `/dev/disk*` block device; this also
    // filters out `devfs`, `map auto_home` and other pseudo-filesystems.
    if (!device.startsWith('/dev/disk')) continue
    if (HIDDEN_MOUNTS.has(mountPoint)) continue
    // Filter any internal APFS volume under /System/Volumes/ or Xcode simulator runtimes.
    if (mountPoint.startsWith('/System/Volumes/')) continue
    if (mountPoint.startsWith('/Library/Developer/CoreSimulator/')) continue
    // Only user-facing disks: root '/' or external mounts under '/Volumes/'
    if (mountPoint !== '/' && !mountPoint.startsWith('/Volumes/')) continue
    // Skip the macOS symlink /Volumes/Macintosh HD alias to /
    if (mountPoint === '/Volumes/Macintosh HD') continue

    const blocks = Number(blocksRaw)
    const used = Number(usedRaw)
    const free = Number(freeRaw)
    if (!Number.isFinite(blocks) || blocks <= 0) continue

    // `df -k` reports 1024-byte blocks.
    const total = blocks * 1024
    const freeBytes = (Number.isFinite(free) ? free : 0) * 1024
    // On macOS APFS, df's reported 'used' for '/' only reflects the sealed system snapshot (~12GB).
    // The shared APFS container's true used space is (total - free).
    const calculatedUsed = Math.max(0, total - freeBytes)
    const usedBytes = mountPoint === '/' ? calculatedUsed : (Number.isFinite(used) ? used : 0) * 1024

    disks.push({
      mountPoint,
      label: labelFor(mountPoint),
      total,
      used: usedBytes,
      free: freeBytes
    })
  }

  return disks
}

function labelFor(mountPoint: string): string {
  if (mountPoint === '/') return 'Macintosh HD'
  const segment = mountPoint.split('/').filter(Boolean).pop()
  return segment ?? mountPoint
}

/**
 * Fills in the human-facing metadata `df` does not report, using `diskutil`.
 * Best-effort: a failure here leaves the `df` values untouched.
 */
async function enrich(disk: DiskInfo): Promise<DiskInfo> {
  try {
    const { stdout } = await execFileAsync('diskutil', ['info', disk.mountPoint], {
      timeout: 4000,
      maxBuffer: 1024 * 1024
    })

    const volumeName = /Volume Name:\s*(.+)/.exec(stdout)?.[1]?.trim()
    const mediaName = /Device \/ Media Name:\s*(.+)/.exec(stdout)?.[1]?.trim()
    const removable = /Removable Media:\s*(.+)/.exec(stdout)?.[1]?.trim()
    const personality = /File System Personality:\s*(.+)/.exec(stdout)?.[1]?.trim()

    if (volumeName) disk.label = volumeName
    if (mediaName) disk.model = mediaName
    if (removable) disk.isRemovable = /removable|ejectable/i.test(removable)
    if (personality) disk.filesystem = personality
  } catch {
    // diskutil missing or the volume has no info plist — keep df's numbers.
  }
  return disk
}

/** Live usage for a single mount point via `fs.statfs` (Node 19+). */
async function liveUsage(mountPoint: string): Promise<{ free: number } | null> {
  try {
    const stats = await fs.statfs(mountPoint)
    const total = Number(stats.blocks) * Number(stats.bsize)
    const free = Number(stats.bavail) * Number(stats.bsize)
    if (!Number.isFinite(total) || total <= 0) return null
    if (!Number.isFinite(free)) return null
    return { free }
  } catch {
    return null
  }
}

/** All mounted, human-interesting volumes. */
export async function listDisks(): Promise<DiskInfo[]> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.disks

  const { stdout } = await execFileAsync('df', ['-kP'], { maxBuffer: 4 * 1024 * 1024 })
  const disks = await Promise.all(
    parseDfOutput(stdout).map(async (disk) => {
      const enriched = await enrich(disk)
      const live = await liveUsage(enriched.mountPoint)
      if (live && Number.isFinite(live.free)) {
        enriched.free = live.free
        enriched.used = Math.max(0, enriched.total - live.free)
      }
      return enriched
    })
  )
  cache = { at: now, disks }
  return disks
}

export async function getDiskInfo(mountPoint: string): Promise<DiskInfo> {
  const disks = await listDisks()
  const known = disks.find((disk) => disk.mountPoint === mountPoint)

  const live = await liveUsage(mountPoint)
  if (known) {
    if (!live) return known
    return {
      ...known,
      free: live.free,
      used: Math.max(0, known.total - live.free)
    }
  }

  // Unknown mount point: fall back to a one-off df row.
  const { stdout } = await execFileAsync('df', ['-kP', mountPoint], { maxBuffer: 4 * 1024 * 1024 })
  const [fallback] = parseDfOutput(stdout)
  if (fallback) return enrich(fallback)

  throw new Error(`No disk information available for ${mountPoint}`)
}

/** Drops the cached volume list, e.g. after a volume is mounted or ejected. */
export function invalidateDiskCache(): void {
  cache = null
}
