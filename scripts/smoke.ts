/**
 * Smoke test for the main-process modules that do not need Electron: the
 * recursive scanner and the `df` output parser.
 *
 * Run with `npm run smoke`. esbuild bundles this file first so the `@shared/*`
 * alias resolves exactly as it does in the real build.
 */
import { execFile } from 'node:child_process'
import { existsSync, promises as fs, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { parseDfOutput } from '../src/main/modules/diskInfo'
import { findDuplicates } from '../src/main/modules/duplicates'
import {
  scanDirectory,
  ScanCancelledError,
  shouldSkipEntry,
  shouldSkipPath
} from '../src/main/modules/scanner'
import type { DiskNode, DuplicateProgress, ScanProgress } from '../src/shared/types'

const execFileAsync = promisify(execFile)

let failures = 0

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  \u2713 ${label}`)
    return
  }
  failures += 1
  console.error(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`)
}

function maxDepth(node: DiskNode): number {
  if (!node.children || node.children.length === 0) return 0
  return 1 + Math.max(...node.children.map((child) => maxDepth(child)))
}

function findByPath(node: DiskNode, target: string): DiskNode | null {
  if (node.path === target) return node
  for (const child of node.children ?? []) {
    const match = findByPath(child, target)
    if (match) return match
  }
  return null
}

/** Builds a fixture with real content, a followed symlink and a symlink loop. */
async function buildFixture(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'sub', 'deeper'), { recursive: true })
  await fs.mkdir(path.join(root, 'empty'), { recursive: true })
  await fs.writeFile(path.join(root, 'a.txt'), Buffer.alloc(1000, 'a'))
  await fs.writeFile(path.join(root, 'sub', 'b.bin'), Buffer.alloc(2000, 'b'))
  await fs.writeFile(path.join(root, 'sub', 'deeper', 'c.dat'), Buffer.alloc(3000, 'c'))

  // A symlink to a sibling directory (should be followed once)…
  await fs.symlink(path.join(root, 'sub'), path.join(root, 'link'), 'dir')
  // …and a cycle back to the root (must not loop forever).
  await fs.symlink(root, path.join(root, 'loop'), 'dir')
  // A dangling link must not crash the walk.
  await fs.symlink(path.join(root, 'does-not-exist'), path.join(root, 'broken'))

  // A directory that merely *shares a name* with a guarded system path is real
  // user data and must survive the walk.
  await fs.mkdir(path.join(root, 'dev'), { recursive: true })
  await fs.writeFile(path.join(root, 'dev', 'keep.txt'), Buffer.alloc(400, 'd'))

  // …and a symlink aimed at devfs must not be followed into it.
  if (existsSync('/dev')) await fs.symlink('/dev', path.join(root, 'gateway'), 'dir')

  // The shape macOS's boot-disk alias produces: a symlinked directory whose
  // real children include a folder that merely shares a guarded name.
  await fs.mkdir(path.join(root, 'target', 'dev'), { recursive: true })
  await fs.writeFile(path.join(root, 'target', 'dev', 'via-link.txt'), Buffer.alloc(400, 'v'))
  await fs.symlink(path.join(root, 'target'), path.join(root, 'alias'), 'dir')
}

function testSkipGuards(): void {
  console.log('\nskip guards (pseudo-filesystems)')

  check('a real /dev entry is skipped', shouldSkipEntry('/', 'dev', '/'))
  check('anything under /dev is skipped', shouldSkipPath('/dev/fd/12', '/'))
  check('/proc and /sys are skipped', shouldSkipEntry('/', 'proc', '/') && shouldSkipEntry('/', 'sys', '/'))
  check('/System/Volumes/VM is skipped', shouldSkipEntry('/System/Volumes', 'VM', '/'))
  check('/System/Volumes/Data is skipped', shouldSkipEntry('/System/Volumes', 'Data', '/'))

  check(
    'a user folder named dev is kept',
    !shouldSkipEntry('/Users/prem/projects', 'dev', '/Users/prem/projects')
  )
  check(
    'a user folder named Data is kept',
    !shouldSkipEntry('/Users/prem/projects', 'Data', '/Users/prem/projects')
  )

  // Regression: `/Volumes/Macintosh HD` is a symlink to `/`, so a scan started
  // there reaches the real /dev through a different prefix. Resolving the root
  // first is what makes the guard fire.
  if (existsSync('/Volumes/Macintosh HD')) {
    const realAlias = realpathSync('/Volumes/Macintosh HD')
    check(
      'the boot-disk alias resolves onto the real filesystem',
      shouldSkipEntry(realAlias, 'dev', realAlias),
      realAlias
    )
    // The reported failure, exactly: a walk that reaches `/Volumes/Macintosh
    // HD/dev/fd/…` is really touching `/dev/fd/…`, which is what the resolved
    // path makes visible to the guard.
    check(
      'the aliased route into devfs is caught',
      shouldSkipEntry(realAlias, 'dev', '/Volumes') && shouldSkipPath('/dev/fd/12', '/Volumes')
    )
  }

  // A volume the user asked for by name is never skipped, even though it lives
  // under a guarded path.
  check(
    'the Data volume itself is still scannable',
    !shouldSkipEntry('/System/Volumes', 'Data', '/System/Volumes/Data')
  )
}

async function testScanner(): Promise<void> {
  console.log('\nscanner')

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'disklens-smoke-'))
  await buildFixture(root)

  try {
    const progress: ScanProgress[] = []
    const controller = new AbortController()

    const tree = await scanDirectory({
      root,
      signal: controller.signal,
      onProgress: (entry) => progress.push(entry)
    })

    check('scan terminates and returns the root node', tree.path === root)
    check('root is a directory', tree.type === 'directory')
    check(
      'real content is counted',
      tree.size >= 6000,
      `expected >= 6000, got ${tree.size}`
    )
    check('progress was emitted', progress.length > 0)
    check('progress reports files', (progress.at(-1)?.scannedFiles ?? 0) > 0)

    const aTxt = findByPath(tree, path.join(root, 'a.txt'))
    check('a.txt is found with its exact size', aTxt?.size === 1000, `got ${aTxt?.size}`)

    const sub = findByPath(tree, path.join(root, 'sub'))
    check('sub rolls up child sizes', sub?.size === 5000, `got ${sub?.size}`)

    const empty = findByPath(tree, path.join(root, 'empty'))
    check('empty directory has no children', empty?.children === undefined)

    const link = findByPath(tree, path.join(root, 'link'))
    check('symlinked directory is followed (one level)', (link?.size ?? 0) === 5000)
    check('followed symlink is flagged', link?.isSymlink === true)

    const broken = findByPath(tree, path.join(root, 'broken'))
    check('dangling symlink is kept as a file', broken?.type === 'file')
    check('dangling symlink is flagged', broken?.isSymlink === true)

    const depth = maxDepth(tree)
    check('symlink cycle is bounded', depth <= 5, `max depth was ${depth}`)

    const devDir = findByPath(tree, path.join(root, 'dev', 'keep.txt'))
    check('a directory named dev is scanned', devDir?.size === 400, `got ${devDir?.size}`)

    const gateway = findByPath(tree, path.join(root, 'gateway'))
    check('a symlink aimed at /dev is not followed', gateway === null)
    check('walking past that symlink did not abort the scan', tree.size > 0)

    const viaLink = findByPath(tree, path.join(root, 'alias', 'dev', 'via-link.txt'))
    check('the guards do not over-reach through a symlink', viaLink?.size === 400)

    check(
      'categories are stamped onto files',
      aTxt?.category === 'Documents',
      `got ${aTxt?.category}`
    )

    // A symlinked root — what macOS's open dialog calls "Macintosh HD" — must
    // scan its target rather than being rejected as "not a directory".
    const aliasedRoot = `${root}-alias`
    await fs.symlink(root, aliasedRoot, 'dir')
    try {
      const aliasTree = await scanDirectory({
        root: aliasedRoot,
        signal: new AbortController().signal,
        onProgress: () => {}
      })
      check('a symlinked root scans its target', aliasTree.size >= 6000, String(aliasTree.size))
      check(
        'a symlinked root keeps a real folder named dev',
        findByPath(aliasTree, path.join(aliasedRoot, 'dev', 'keep.txt'))?.size === 400
      )
      check(
        'a symlinked root does not walk into devfs',
        findByPath(aliasTree, path.join(aliasedRoot, 'gateway')) === null
      )
    } finally {
      await fs.unlink(aliasedRoot).catch(() => {})
    }

    // Cancellation
    const aborted = new AbortController()
    aborted.abort()
    let cancelled: unknown = null
    try {
      await scanDirectory({ root, signal: aborted.signal, onProgress: () => {} })
    } catch (err) {
      cancelled = err
    }
    check('a pre-aborted scan rejects with ScanCancelledError', cancelled instanceof ScanCancelledError)

    // Missing / non-directory roots
    let missing: unknown = null
    try {
      await scanDirectory({
        root: path.join(root, 'nope'),
        signal: new AbortController().signal,
        onProgress: () => {}
      })
    } catch (err) {
      missing = err
    }
    check('a missing root rejects', missing instanceof Error)

    let notADir: unknown = null
    try {
      await scanDirectory({
        root: path.join(root, 'a.txt'),
        signal: new AbortController().signal,
        onProgress: () => {}
      })
    } catch (err) {
      notADir = err
    }
    check('a non-directory root rejects', notADir instanceof Error)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function testDfParsing(): Promise<void> {
  console.log('\ndf parser')

  const { stdout } = await execFileAsync('df', ['-kP'], { maxBuffer: 4 * 1024 * 1024 })
  const disks = parseDfOutput(stdout)

  check('at least one volume is parsed', disks.length > 0)
  check(
    'the boot volume is present',
    disks.some((disk) => disk.mountPoint === '/'),
    JSON.stringify(disks.map((disk) => disk.mountPoint))
  )
  check(
    'every volume has a positive total',
    disks.every((disk) => disk.total > 0)
  )
  check(
    'every volume has a label',
    disks.every((disk) => disk.label.length > 0)
  )
  check(
    'used bytes never exceed the total',
    disks.every((disk) => disk.used <= disk.total),
    JSON.stringify(disks.filter((disk) => disk.used > disk.total))
  )
  check(
    'virtual APFS volumes stay hidden',
    !disks.some((disk) => disk.mountPoint === '/System/Volumes/VM')
  )
  check(
    'pseudo-filesystems are filtered out',
    !disks.some((disk) => disk.mountPoint === '/dev')
  )

  // Synthetic rows, including a mount point containing spaces.
  const synthetic = parseDfOutput(
    [
      'Filesystem     1024-blocks      Used Available Capacity  Mounted on',
      '/dev/disk9s1       1000000    400000    600000     40%    /Volumes/My Backup Drive',
      'devfs                  205       205         0   100%    /dev',
      '/dev/disk1s1           563200      6164    540204     2%    /System/Volumes/xarts'
    ].join('\n')
  )

  check('mount points with spaces survive parsing', synthetic.length === 1)
  check(
    'space-containing mount point is intact',
    synthetic[0]?.mountPoint === '/Volumes/My Backup Drive',
    synthetic[0]?.mountPoint
  )
  check(
    'kilobyte blocks convert to bytes',
    synthetic[0]?.total === 1000000 * 1024,
    String(synthetic[0]?.total)
  )
  check(
    'hidden APFS volumes are dropped',
    !synthetic.some((disk) => disk.mountPoint.startsWith('/System/Volumes/'))
  )
}

async function testDuplicates(): Promise<void> {
  console.log('\nduplicate finder')

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'disklens-dupes-'))

  try {
    const identical = Buffer.alloc(128 * 1024, 'x')
    const sameSizeDifferent = Buffer.alloc(128 * 1024, 'y')

    await fs.mkdir(path.join(root, 'nested'), { recursive: true })
    await fs.writeFile(path.join(root, 'one.bin'), identical)
    await fs.writeFile(path.join(root, 'two.bin'), identical)
    await fs.writeFile(path.join(root, 'three.bin'), sameSizeDifferent)
    await fs.writeFile(path.join(root, 'unique.bin'), Buffer.alloc(50 * 1024, 'z'))
    await fs.writeFile(path.join(root, 'nested', 'one-copy.bin'), identical)
    // A zero-byte file must never be treated as a duplicate.
    await fs.writeFile(path.join(root, 'empty-a'), '')
    await fs.writeFile(path.join(root, 'empty-b'), '')

    const stages: DuplicateProgress['stage'][] = []
    const groups = await findDuplicates({
      root,
      signal: new AbortController().signal,
      onProgress: (entry) => stages.push(entry.stage)
    })

    check('exactly one duplicate group is reported', groups.length === 1, `got ${groups.length}`)

    const [group] = groups
    check('the group has three copies', group?.files.length === 3, `got ${group?.files.length}`)
    check('the group reports the file size', group?.size === 128 * 1024, String(group?.size))
    check(
      'same-size but different content is excluded',
      !group?.files.some((file) => file.endsWith('three.bin'))
    )
    check(
      'uniquely-sized files are excluded',
      !group?.files.some((file) => file.endsWith('unique.bin'))
    )
    check(
      'empty files are excluded',
      !group?.files.some((file) => file.endsWith('empty-a') || file.endsWith('empty-b'))
    )
    check('a stable hash is produced', typeof group?.hash === 'string' && group.hash.length === 40)

    check('progress reports the sizing pass', stages.includes('sizing'))
    check('progress reports the partial-hash pass', stages.includes('partial-hash'))
    check('progress reports the full-hash pass', stages.includes('full-hash'))
    check('progress finishes', stages.at(-1) === 'done')

    // `hashPass` falls back to main-thread hashing when the worker cannot
    // start, which would hide a broken worker entry. Load it directly so the
    // worker path is actually verified.
    const workerPath = path.join(__dirname, 'hashWorker.js')
    check('the hashWorker bundle sits next to the main bundle', existsSync(workerPath))

    const expected = group?.hash ?? ''
    const workerHash = await new Promise<string | null>((resolve, reject) => {
      const worker = new Worker(workerPath)
      let last: string | null = null
      worker.on('message', (message: { done?: true; hash?: string | null }) => {
        if (message.done) {
          void worker.terminate()
          resolve(last)
          return
        }
        last = message.hash ?? null
      })
      worker.on('error', reject)
      worker.postMessage({ id: 1, files: [path.join(root, 'one.bin')] })
    })

    check('the worker entry loads and hashes a file', workerHash === expected, String(workerHash))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  testSkipGuards()
  await testScanner()
  await testDfParsing()
  await testDuplicates()

  console.log(
    failures === 0 ? '\nAll smoke checks passed.\n' : `\n${failures} smoke check(s) failed.\n`
  )
  process.exit(failures === 0 ? 0 : 1)
}

void main()
