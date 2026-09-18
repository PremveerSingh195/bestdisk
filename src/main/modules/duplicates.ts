import { createHash } from 'node:crypto'
import { promises as fs, createReadStream } from 'node:fs'
import { cpus } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { DuplicateGroup, DuplicateProgress } from '@shared/types'
import { shouldSkipPath } from './scanner'
import type { HashRequest, HashResponse } from './hashWorker'

/** How much of each file is hashed in the cheap second pass. */
const PARTIAL_BYTES = 64 * 1024
/** Zero-byte files are never duplicates worth reporting. */
const MIN_CANDIDATE_BYTES = 1
const MAX_WORKERS = Math.max(1, Math.min(4, cpus().length - 1))

export interface DuplicateFinderOptions {
  root: string
  signal: AbortSignal
  onProgress: (progress: DuplicateProgress) => void
}

/**
 * Three-pass duplicate finder:
 *
 *  1. group every file by exact size (cheap — no hashing at all)
 *  2. hash the first 64 KB of size-matched candidates
 *  3. fully hash only the files that survived both passes
 *
 * Passes 2 and 3 run in worker threads so the main process stays responsive.
 */
export async function findDuplicates(options: DuplicateFinderOptions): Promise<DuplicateGroup[]> {
  const { root, signal, onProgress } = options

  onProgress({ stage: 'sizing', processed: 0, total: 0 })
  const bySize = await collectBySize(root, signal)

  const sizeGroups = [...bySize.entries()]
    .filter(([, files]) => files.length > 1)
    .sort((a, b) => b[0] - a[0])

  const candidates = sizeGroups.flatMap(([, files]) => files)
  if (candidates.length === 0) {
    onProgress({ stage: 'done', processed: 0, total: 0 })
    return []
  }

  const partial = await hashPass(candidates, PARTIAL_BYTES, signal, (processed) =>
    onProgress({ stage: 'partial-hash', processed, total: candidates.length })
  )

  const afterPartial = new Map<string, { size: number; files: string[] }>()
  for (const [size, files] of sizeGroups) {
    for (const file of files) {
      const hash = partial.get(file)
      if (!hash) continue
      const key = `${size}:${hash}`
      const group = afterPartial.get(key)
      if (group) group.files.push(file)
      else afterPartial.set(key, { size, files: [file] })
    }
  }

  const stillCandidates = [...afterPartial.values()].filter((group) => group.files.length > 1)
  const fullTargets = stillCandidates.flatMap((group) => group.files)

  const full = await hashPass(fullTargets, undefined, signal, (processed) =>
    onProgress({ stage: 'full-hash', processed, total: fullTargets.length })
  )

  const groups: DuplicateGroup[] = []
  for (const group of stillCandidates) {
    const confirmed = new Map<string, string[]>()
    for (const file of group.files) {
      const hash = full.get(file)
      if (!hash) continue
      const bucket = confirmed.get(hash)
      if (bucket) bucket.push(file)
      else confirmed.set(hash, [file])
    }
    for (const [hash, files] of confirmed) {
      if (files.length > 1) groups.push({ hash, size: group.size, files })
    }
  }

  onProgress({ stage: 'done', processed: fullTargets.length, total: fullTargets.length })

  // Most wasted space first — that is what the user actually wants to reclaim.
  return groups.sort((a, b) => wasted(b) - wasted(a))
}

function wasted(group: DuplicateGroup): number {
  return group.size * (group.files.length - 1)
}

/** Pass 1: walk the tree and bucket file paths by their exact byte size. */
async function collectBySize(
  root: string,
  signal: AbortSignal
): Promise<Map<number, string[]>> {
  const bySize = new Map<number, string[]>()
  // Same alias-aware guards as the main scanner: `/Volumes/Macintosh HD` is a
  // symlink to `/`, so entries are resolved before they are compared against
  // the guarded pseudo-filesystem paths.
  const realRoot = await fs.realpath(root).catch(() => root)
  const stack: Array<{ dir: string; realDir: string }> = [{ dir: root, realDir: realRoot }]

  while (stack.length > 0) {
    if (signal.aborted) throw new Error('Duplicate scan cancelled')

    const current = stack.pop()
    if (current === undefined) break
    const { dir, realDir } = current

    let dirents
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      // Unreadable directory — skip it, same policy as the main scanner.
      continue
    }

    for (const dirent of dirents) {
      const fullPath = path.join(dir, dirent.name)
      const realEntry = path.join(realDir, dirent.name)
      if (shouldSkipPath(realEntry, realRoot)) continue

      // Duplicate hunting deliberately does not follow symlinks: the same
      // bytes reachable under two paths are not wasted space.
      if (dirent.isSymbolicLink()) continue

      if (dirent.isDirectory()) {
        stack.push({ dir: fullPath, realDir: realEntry })
        continue
      }
      if (!dirent.isFile()) continue

      try {
        const stats = await fs.stat(fullPath)
        if (stats.size < MIN_CANDIDATE_BYTES) continue
        const bucket = bySize.get(stats.size)
        if (bucket) bucket.push(fullPath)
        else bySize.set(stats.size, [fullPath])
      } catch {
        // Vanished or unreadable since readdir — not a candidate.
      }
    }
  }

  return bySize
}

/** Hashes a list of files, preferring worker threads with an inline fallback. */
async function hashPass(
  files: string[],
  bytes: number | undefined,
  signal: AbortSignal,
  onTick: (processed: number) => void
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()
  if (files.length === 0) return results

  let processed = 0
  const record = (file: string, hash: string | null): void => {
    results.set(file, hash)
    processed += 1
    onTick(processed)
  }

  try {
    await runHashWorkers(files, bytes, signal, record)
  } catch {
    // Worker threads are unavailable (for example the worker entry failed to
    // load). Hashing inline keeps the feature working, just slower.
    for (const file of files) {
      if (signal.aborted) break
      record(file, await hashFileInline(file, bytes))
    }
  }

  return results
}

function runHashWorkers(
  files: string[],
  bytes: number | undefined,
  signal: AbortSignal,
  onFile: (file: string, hash: string | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const poolSize = Math.max(1, Math.min(MAX_WORKERS, files.length))
    const chunks = splitRoundRobin(files, poolSize)
    // Both entries live in out/main, so this resolves in dev and in a build.
    const workerPath = path.join(__dirname, 'hashWorker.js')

    const workers: Worker[] = []
    const completed = new Set<number>()
    let remaining = chunks.length
    let settled = false

    // Declared as hoisted functions so they can reference one another.
    function cleanup(): void {
      signal.removeEventListener('abort', onAbort)
      for (const worker of workers) void worker.terminate()
    }

    function finish(): void {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    function fail(err: Error): void {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    function onAbort(): void {
      finish()
    }

    if (chunks.length === 0) {
      settled = true
      resolve()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })

    chunks.forEach((chunk, index) => {
      const id = index + 1
      let worker: Worker
      try {
        worker = new Worker(workerPath)
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)))
        return
      }
      workers.push(worker)

      worker.on('message', (message: HashResponse) => {
        if ('done' in message) {
          completed.add(message.id)
          remaining -= 1
          if (remaining === 0) finish()
          return
        }
        onFile(message.file, message.hash)
      })

      worker.on('error', (err) => fail(err))

      worker.on('exit', (code) => {
        if (!completed.has(id)) {
          fail(new Error(`Hash worker exited early with code ${code}`))
        }
      })

      const request: HashRequest =
        bytes === undefined ? { id, files: chunk } : { id, files: chunk, bytes }
      worker.postMessage(request)
    })
  })
}

/** Deals items out round-robin so every worker gets a similar amount of work. */
function splitRoundRobin<T>(items: readonly T[], parts: number): T[][] {
  const buckets: T[][] = Array.from({ length: parts }, () => [])
  for (let index = 0; index < items.length; index += 1) {
    buckets[index % parts].push(items[index])
  }
  return buckets.filter((bucket) => bucket.length > 0)
}

/** Main-thread hashing used only when the worker pool could not start. */
function hashFileInline(file: string, bytes?: number): Promise<string | null> {
  return new Promise((resolve) => {
    const hash = createHash('sha1')
    const stream = createReadStream(
      file,
      bytes === undefined ? undefined : { start: 0, end: bytes - 1 }
    )
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', () => resolve(null))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
