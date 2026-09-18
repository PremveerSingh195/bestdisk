import { promises as fs } from 'node:fs'
import type { Stats } from 'node:fs'
import path from 'node:path'
import type { DiskNode, ScanProgress } from '@shared/types'
import { categorize, extensionOf } from '@shared/categorize'

/**
 * Trees that must never be walked. Matched against *resolved* paths — see
 * `shouldSkipPath`.
 *
 * - `/dev`, `/proc`, `/sys` are device and pseudo filesystems. Their entries
 *   track the process's own file descriptors, so they appear and disappear
 *   mid-walk (`lstat` then fails with EBADF) and `/dev/fd/N` can resolve back
 *   into an arbitrary directory.
 * - `/System/Volumes/VM` is swap and keeps growing for the whole scan.
 * - `/System/Volumes/Data` is the tree the firmlinks (`/Users`, `/Library`,
 *   `/Applications`, …) already expose, so walking it as well would count every
 *   user file twice.
 *
 * Matches cover the whole guarded tree, so a symlinked route into `/dev/fd` is
 * caught too. The one exception is the scan root itself: a volume the user
 * picked by name, such as the Data volume, is never skipped.
 */
const SKIP_PATHS = new Set([
  '/proc',
  '/sys',
  '/dev',
  '/System/Volumes',
  '/Library/Developer/CoreSimulator/Volumes',
  '/.Spotlight-V100',
  '/.DocumentRevisions-V100',
  '/.fseventsd',
  '/.PKInstallSandboxManager',
  '/.MobileBackups',
  '/.Trashes'
])

/**
 * True when `realPath` is one of the guarded trees.
 *
 * `realRoot` is the *resolved* scan root. A guarded path that contains the scan
 * root is never skipped, so picking a specific subvolume still works.
 */
export function shouldSkipPath(realPath: string, realRoot: string): boolean {
  // Never walk /Volumes when scanning '/' (Macintosh HD) because /Volumes contains
  // other mounted disks and the /Volumes/Macintosh HD -> / symlink loop.
  // When scanning an external volume (e.g. /Volumes/MyUSB), only allow paths within it.
  if (realPath === '/Volumes' || realPath.startsWith('/Volumes/')) {
    if (realRoot === '/') return true
    if (realPath === '/Volumes/Macintosh HD' || realPath.startsWith('/Volumes/Macintosh HD/')) {
      return true
    }
    if (!realPath.startsWith(realRoot) && !realRoot.startsWith(realPath)) {
      return true
    }
  }

  for (const guarded of SKIP_PATHS) {
    if (realPath === guarded || realPath.startsWith(`${guarded}/`)) {
      return realRoot !== guarded && !realRoot.startsWith(`${guarded}/`)
    }
  }
  return false
}

/** Skip decision for one directory entry, given its parent's resolved path. */
export function shouldSkipEntry(realDir: string, name: string, realRoot: string): boolean {
  return shouldSkipPath(path.join(realDir, name), realRoot)
}

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled')
    // Matches the name Node uses for AbortSignal-driven rejections.
    this.name = 'AbortError'
  }
}

export interface ScannerOptions {
  root: string
  signal: AbortSignal
  onProgress: (progress: ScanProgress) => void
  /** How often progress is pushed to the renderer. */
  progressIntervalMs?: number
}

interface ScanContext {
  signal: AbortSignal
  /** The scan root after symlink resolution; see `shouldSkipPath`. */
  realRoot: string
  /** `dev:ino` keys of symlinked directories we have already descended into. */
  visited: Set<string>
  stats: {
    files: number
    dirs: number
    bytes: number
    currentPath: string
    /** Entries dropped because they could not be read. */
    skipped: number
  }
  /** Entry failures already logged, capped so one bad volume cannot flood. */
  loggedFailures: number
}

/** How many individual entry failures are reported before going quiet. */
const MAX_ENTRY_FAILURE_LOGS = 20

/** Error codes that mean "skip this entry", not "the scan is broken". */
const RECOVERABLE_CODES = new Set([
  'EACCES',
  'EPERM',
  'ENOENT',
  'ELOOP',
  'ENOTDIR',
  'EBUSY',
  'ENAMETOOLONG',
  'EMFILE',
  'ENFILE',
  'EIO',
  // devfs/fifo entries race with the process's own file descriptors: the entry
  // is listed, the descriptor closes, and the stat fails. Per-entry, not fatal.
  'EBADF',
  'ENXIO',
  'ENODEV'
])

function isRecoverable(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return code !== undefined && RECOVERABLE_CODES.has(code)
}

/**
 * Drops one unreadable or vanished entry. A disk this large always contains a
 * few, and failing the whole scan over one of them would leave the user with
 * nothing at all.
 */
function reportEntryFailure(err: unknown, target: string, ctx: ScanContext): void {
  ctx.stats.skipped += 1
  if (ctx.loggedFailures >= MAX_ENTRY_FAILURE_LOGS) return
  ctx.loggedFailures += 1
  const code = (err as NodeJS.ErrnoException | undefined)?.code ?? 'unknown error'
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`[scanner] skipping ${target} (${code}: ${message})`)
}

async function lstatSafe(target: string): Promise<Stats | null> {
  try {
    return await fs.lstat(target)
  } catch (err) {
    if (isRecoverable(err)) return null
    throw err
  }
}

async function statSafe(target: string): Promise<Stats | null> {
  try {
    return await fs.stat(target)
  } catch (err) {
    if (isRecoverable(err)) return null
    throw err
  }
}

/** Resolves a symlink to its real location. `null` when it cannot be read. */
async function realpathSafe(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target)
  } catch {
    return null
  }
}

interface WorkDir {
  dirNode: DiskNode
  realPath: string
  symlinkDepth: number
  depth: number
}

/** Number of concurrent directory-reading workers across the entire scan. */
const CONCURRENCY = 32

/** Maximum individual file nodes retained per directory before rolling up smaller files into "Other". */
const MAX_FILES_PER_DIR = 50

/** How many file lstats to batch in parallel within one directory. */
const LSTAT_BATCH_SIZE = 64

/**
 * Iteratively scans `root` with a worker pool and resolves with the rolled-up tree.
 *
 * Uses an iterative work queue (DFS order) rather than unbounded recursive promises.
 * This guarantees constant stack depth, sub-second GC, flat memory usage, and zero
 * PartitionAlloc/V8 heap exhaustion even on drives with millions of files.
 */
export async function scanDirectory(options: ScannerOptions): Promise<DiskNode> {
  const { root, signal, onProgress, progressIntervalMs = 200 } = options

  if (signal.aborted) throw new ScanCancelledError()

  const ctx: ScanContext = {
    signal,
    realRoot: root,
    visited: new Set<string>(),
    loggedFailures: 0,
    stats: { files: 0, dirs: 0, bytes: 0, currentPath: root, skipped: 0 }
  }

  // `stat`, not `lstat`: macOS's open dialog hands back aliases such as
  // `/Volumes/Macintosh HD` (a symlink to `/`), and those are meant to be
  // scanned, not rejected.
  const rootStats = await statSafe(root)
  if (!rootStats) {
    throw new Error(`Cannot read ${root} — the path does not exist or is not accessible.`)
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`${root} is not a directory.`)
  }

  // Seed root's inode so no symlink anywhere in the tree can loop back to it.
  ctx.visited.add(`${rootStats.dev}:${rootStats.ino}`)

  // Resolve the root once so an aliased root still hits the guards:
  // the alias's real children are compared against `SKIP_PATHS`.
  ctx.realRoot = (await realpathSafe(root)) ?? root

  // Fail loudly when the very root is unreadable (usually a TCC permission problem).
  try {
    await fs.readdir(root)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM') {
      throw new Error(
        `macOS denied access to ${root}. Grant DiskLens Full Disk Access in System Settings → Privacy & Security.`
      )
    }
    if (isRecoverable(err)) {
      throw new Error(`Cannot read ${root}.`)
    }
    throw err
  }

  const rootNode: DiskNode = {
    id: root,
    name: path.basename(root) || root,
    path: root,
    size: 0,
    type: 'directory',
    category: categorize(path.basename(root) || root, true),
    modifiedAt: rootStats.mtimeMs
  }

  const queue: WorkDir[] = [
    {
      dirNode: rootNode,
      realPath: ctx.realRoot,
      symlinkDepth: 0,
      depth: 0
    }
  ]

  // Track discovered directory nodes so we can compute sizes bottom-up after traversal.
  const allDirs: DiskNode[] = [rootNode]
  let activeWorkers = 0

  const emit = (): void => {
    onProgress({
      scannedFiles: ctx.stats.files,
      scannedDirs: ctx.stats.dirs,
      currentPath: ctx.stats.currentPath,
      bytesFound: ctx.stats.bytes
    })
  }

  const timer = setInterval(emit, progressIntervalMs)

  async function worker(): Promise<void> {
    while (!ctx.signal.aborted) {
      const item = queue.pop()
      if (!item) {
        if (activeWorkers === 0) break
        await new Promise((r) => setTimeout(r, 10))
        if (queue.length === 0 && activeWorkers === 0) break
        continue
      }

      activeWorkers += 1
      try {
        const { dirNode, realPath, symlinkDepth, depth } = item
        ctx.stats.dirs += 1
        ctx.stats.currentPath = dirNode.path

        let dirents
        try {
          dirents = await fs.readdir(dirNode.path, { withFileTypes: true })
        } catch (err) {
          if (isRecoverable(err)) {
            reportEntryFailure(err, dirNode.path, ctx)
            continue
          }
          throw err
        }

        const childDirs: WorkDir[] = []
        const childFiles: DiskNode[] = []
        const pendingFiles: Array<{ dirent: typeof dirents[0]; childPath: string }> = []

        for (const dirent of dirents) {
          if (ctx.signal.aborted) break

          const childPath = path.join(dirNode.path, dirent.name)
          const realChild = path.join(realPath, dirent.name)

          if (shouldSkipPath(realChild, ctx.realRoot)) continue

          try {
            if (dirent.isDirectory()) {
              const childNode: DiskNode = {
                id: childPath,
                name: dirent.name,
                path: childPath,
                size: 0,
                type: 'directory',
                category: categorize(dirent.name, true),
                modifiedAt: 0
              }
              childDirs.push({
                dirNode: childNode,
                realPath: realChild,
                symlinkDepth,
                depth: depth + 1
              })
            } else if (dirent.isSymbolicLink()) {
              const targetStats = await statSafe(childPath)
              if (!targetStats) {
                // Dangling symlink — keep as a file node
                childFiles.push({
                  id: childPath,
                  name: dirent.name,
                  path: childPath,
                  size: 0,
                  type: 'file',
                  category: 'Other',
                  modifiedAt: 0,
                  isSymlink: true
                })
                continue
              }

              const resolvedTarget = (await realpathSafe(childPath)) ?? realChild
              if (
                resolvedTarget === '/' ||
                resolvedTarget === ctx.realRoot ||
                childPath.startsWith(resolvedTarget) ||
                shouldSkipPath(resolvedTarget, ctx.realRoot)
              ) {
                continue
              }

              if (targetStats.isDirectory()) {
                const inodeKey = `${targetStats.dev}:${targetStats.ino}`
                if (symlinkDepth >= 1 || ctx.visited.has(inodeKey)) continue
                ctx.visited.add(inodeKey)

                const childNode: DiskNode = {
                  id: childPath,
                  name: dirent.name,
                  path: childPath,
                  size: 0,
                  type: 'directory',
                  category: categorize(dirent.name, true),
                  modifiedAt: targetStats.mtimeMs,
                  isSymlink: true
                }
                childDirs.push({
                  dirNode: childNode,
                  realPath: resolvedTarget,
                  symlinkDepth: symlinkDepth + 1,
                  depth: depth + 1
                })
              } else if (targetStats.isFile()) {
                ctx.stats.files += 1
                ctx.stats.bytes += targetStats.size
                childFiles.push({
                  id: childPath,
                  name: dirent.name,
                  path: childPath,
                  size: targetStats.size,
                  type: 'file',
                  extension: extensionOf(dirent.name) || undefined,
                  category: categorize(dirent.name, false),
                  modifiedAt: targetStats.mtimeMs,
                  isSymlink: true
                })
              }
            } else if (dirent.isFile()) {
              // Collected below for batched lstat
              pendingFiles.push({ dirent, childPath })
            }
          } catch (err) {
            if (ctx.signal.aborted) break
            reportEntryFailure(err, childPath, ctx)
          }
        }

        // Batch-lstat all regular files in parallel for throughput.
        for (let i = 0; i < pendingFiles.length; i += LSTAT_BATCH_SIZE) {
          if (ctx.signal.aborted) break
          const batch = pendingFiles.slice(i, i + LSTAT_BATCH_SIZE)
          const results = await Promise.all(
            batch.map(async ({ dirent, childPath }) => {
              try {
                const st = await lstatSafe(childPath)
                if (!st) return null
                return { dirent, childPath, st }
              } catch (err) {
                reportEntryFailure(err, childPath, ctx)
                return null
              }
            })
          )
          for (const r of results) {
            if (!r) continue
            ctx.stats.files += 1
            ctx.stats.bytes += r.st.size
            childFiles.push({
              id: r.childPath,
              name: r.dirent.name,
              path: r.childPath,
              size: r.st.size,
              type: 'file',
              extension: extensionOf(r.dirent.name) || undefined,
              category: categorize(r.dirent.name, false),
              modifiedAt: r.st.mtimeMs
            })
          }
        }

        // Limit individual file nodes in massive directories to top N largest + 1 "Other" bucket.
        let keptFiles = childFiles
        if (childFiles.length > MAX_FILES_PER_DIR) {
          childFiles.sort((a, b) => b.size - a.size)
          keptFiles = childFiles.slice(0, MAX_FILES_PER_DIR)
          const rest = childFiles.slice(MAX_FILES_PER_DIR)
          const restSize = rest.reduce((sum, f) => sum + f.size, 0)
          keptFiles.push({
            id: `${dirNode.path}::other`,
            name: `Other · ${rest.length} files`,
            path: dirNode.path,
            size: restSize,
            type: 'file',
            category: 'Other',
            modifiedAt: dirNode.modifiedAt
          })
        }

        const childDirNodes = childDirs.map((cd) => cd.dirNode)
        const combined = [...childDirNodes, ...keptFiles]
        dirNode.children = combined.length > 0 ? combined : undefined

        for (const cd of childDirs) {
          allDirs.push(cd.dirNode)
          queue.push(cd)
        }
      } finally {
        activeWorkers -= 1
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    if (ctx.signal.aborted) {
      throw new ScanCancelledError()
    }

    // Roll up sizes from bottom-up.
    for (let i = allDirs.length - 1; i >= 0; i--) {
      const dir = allDirs[i]
      if (dir.children) {
        dir.size = dir.children.reduce((sum, c) => sum + c.size, 0)
      }
    }

    // Prune deep empty directories and collapse tiny deep subtrees for lightning IPC transfer.
    function pruneTree(node: DiskNode, depth: number): boolean {
      if (node.type === 'file') return true
      if (!node.children || node.children.length === 0) {
        return depth <= 2 || node.size > 0
      }
      // Drop empty directories at depth >= 3
      if (depth >= 3 && node.size === 0) {
        return false
      }
      // Collapse tiny deep subtrees into leaves so the IPC payload is compact:
      const isTinyDeep =
        (depth >= 5 && node.size < 250 * 1024) ||
        (depth >= 6 && node.size < 1024 * 1024) ||
        (depth >= 7 && node.size < 5 * 1024 * 1024) ||
        (depth >= 8 && node.size < 20 * 1024 * 1024)

      if (isTinyDeep) {
        delete node.children
        return true
      }

      node.children = node.children.filter((c) => pruneTree(c, depth + 1))
      if (node.children.length === 0) {
        delete node.children
        return depth <= 2 || node.size > 0
      }
      return true
    }

    pruneTree(rootNode, 0)

    emit()

    if (ctx.stats.skipped > 0) {
      console.warn(
        `[scanner] ${ctx.stats.skipped} entr${ctx.stats.skipped === 1 ? 'y' : 'ies'} could not be read and were left out of the totals.`
      )
    }

    return rootNode
  } finally {
    clearInterval(timer)
  }
}
