import { CATEGORY_COLORS, FILE_CATEGORIES, extensionOf } from '@shared/categorize'
import type { DiskNode, FileCategory, SortDirection, SortKey } from '@shared/types'

/** Suffix appended to the synthetic bucket that absorbs tiny siblings. */
export const OTHER_BUCKET_SUFFIX = '::other'

export interface CategoryTotal {
  category: FileCategory
  size: number
  count: number
  color: string
}

export function isOtherBucket(node: DiskNode): boolean {
  return node.id.endsWith(OTHER_BUCKET_SUFFIX)
}

/** Total bytes directly inside `node` (its children), not the node itself. */
export function childTotal(node: DiskNode): number {
  if (!node.children || node.children.length === 0) return node.size
  return node.children.reduce((sum, child) => sum + child.size, 0)
}

export function childCount(node: DiskNode): number {
  return node.children?.length ?? 0
}

export function isEmptyDirectory(node: DiskNode): boolean {
  return node.type === 'directory' && (node.children?.length ?? 0) === 0
}

/** Depth-first search for a node by its absolute path. */
export function findNode(root: DiskNode, targetPath: string): DiskNode | null {
  if (root.path === targetPath) return root
  if (!root.children) return null
  for (const child of root.children) {
    const match = findNode(child, targetPath)
    if (match) return match
  }
  return null
}

/** Finds the ancestor chain of nodes from root down to targetPath. */
export function findPathTrail(root: DiskNode, targetPath: string): DiskNode[] | null {
  if (root.path === targetPath) return [root]
  if (!root.children) return null
  for (const child of root.children) {
    if (
      targetPath === child.path ||
      targetPath.startsWith(child.path + '/') ||
      targetPath.startsWith(child.path + '\\')
    ) {
      const trail = findPathTrail(child, targetPath)
      if (trail) return [root, ...trail]
    }
  }
  return null
}

/** Re-resolves a drill-down stack against a (possibly rebuilt) tree. */
export function resolveStack(root: DiskNode, paths: string[]): DiskNode[] {
  const stack: DiskNode[] = [root]
  for (const target of paths) {
    const node = findNode(root, target)
    if (!node || node.type !== 'directory') break
    if (node.id !== root.id) stack.push(node)
  }
  return stack
}

/** Every non-directory descendant, depth first. */
export function collectFiles(node: DiskNode, out: DiskNode[] = []): DiskNode[] {
  if (!node.children || node.children.length === 0) {
    if (node.type === 'file') out.push(node)
    return out
  }
  for (const child of node.children) collectFiles(child, out)
  return out
}

export function countNodes(node: DiskNode): number {
  if (!node.children || node.children.length === 0) return 1
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0)
}

/** The `limit` largest files anywhere beneath `node`. */
export function topFiles(node: DiskNode, limit = 50): DiskNode[] {
  const files = collectFiles(node)
  files.sort((a, b) => b.size - a.size)
  return files.slice(0, limit)
}

/** Bytes per category, rolled up from leaf files. */
export function categoryTotals(node: DiskNode): CategoryTotal[] {
  const totals = new Map<FileCategory, { size: number; count: number }>()

  const walk = (current: DiskNode): void => {
    if (current.type === 'file') {
      const category = current.category ?? 'Other'
      const entry = totals.get(category) ?? { size: 0, count: 0 }
      entry.size += current.size
      entry.count += 1
      totals.set(category, entry)
      return
    }
    for (const child of current.children ?? []) walk(child)
  }

  walk(node)

  return FILE_CATEGORIES.map((category) => {
    const entry = totals.get(category)
    return {
      category,
      size: entry?.size ?? 0,
      count: entry?.count ?? 0,
      color: CATEGORY_COLORS[category]
    }
  })
    .filter((total) => total.size > 0)
    .sort((a, b) => b.size - a.size)
}

export function sortNodes(
  nodes: DiskNode[],
  key: SortKey,
  direction: SortDirection
): DiskNode[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...nodes].sort((a, b) => {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name, undefined, { numeric: true }) * factor
      case 'modified':
        return ((a.modifiedAt ?? 0) - (b.modifiedAt ?? 0)) * factor
      case 'type': {
        // Directories first, then alphabetical by extension within a type.
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        const aExt = a.extension ?? ''
        const bExt = b.extension ?? ''
        return aExt.localeCompare(bExt) * factor
      }
      case 'size':
      default:
        return (a.size - b.size) * factor
    }
  })
}

/** Case-insensitive substring match on the node name. */
export function matchesFilter(node: DiskNode, filter: string): boolean {
  if (!filter) return true
  const needle = filter.trim().toLowerCase()
  if (!needle) return true
  if (node.name.toLowerCase().includes(needle)) return true
  const ext = node.extension ?? extensionOf(node.name)
  return ext.length > 0 && ext === needle.replace(/^\./, '')
}

export interface PruneOptions {
  /** Hard cap on the number of nodes handed to a D3 layout. */
  maxNodes?: number
  /** Siblings smaller than this fraction of their parent collapse into "Other". */
  minFraction?: number
}

/**
 * Shrinks a tree to something a chart can render.
 *
 * Two limits are applied together: siblings below `minFraction` of their parent
 * are merged into a single "Other" node, and recursion stops once `maxNodes` is
 * exhausted (the remaining subtrees become leaves).
 */
export function pruneForRender(root: DiskNode, options: PruneOptions = {}): DiskNode {
  const { maxNodes = 2000, minFraction = 0.001 } = options
  let budget = maxNodes

  const walk = (node: DiskNode, parentSize: number): DiskNode => {
    if (budget <= 0) {
      return node.children ? { ...node, children: undefined } : node
    }
    budget -= 1

    if (!node.children || node.children.length === 0) return node

    const threshold = parentSize * minFraction
    const ordered = [...node.children].sort((a, b) => b.size - a.size)
    const kept: DiskNode[] = []
    let otherSize = 0
    let otherCount = 0

    for (const child of ordered) {
      if (child.size < threshold || budget <= 0) {
        otherSize += child.size
        otherCount += 1
        continue
      }
      kept.push(walk(child, node.size))
    }

    if (otherCount > 0) {
      kept.push({
        id: `${node.id}${OTHER_BUCKET_SUFFIX}`,
        name: `Other · ${otherCount} items`,
        path: node.path,
        size: otherSize,
        type: 'directory',
        category: 'Other',
        modifiedAt: node.modifiedAt
      })
    }

    return { ...node, children: kept.length > 0 ? kept : undefined }
  }

  return walk(root, root.size)
}

/**
 * Returns a copy of the tree with `paths` removed, recomputing every affected
 * directory size on the way back up. Used after a trash/delete so the UI
 * reflects the new state without a full rescan.
 */
export function removePaths(root: DiskNode, paths: Iterable<string>): DiskNode {
  const targets = paths instanceof Set ? paths : new Set(paths)

  const prune = (node: DiskNode): DiskNode | null => {
    if (targets.has(node.path)) return null
    if (!node.children || node.children.length === 0) return node

    let changed = false
    const children: DiskNode[] = []
    for (const child of node.children) {
      const next = prune(child)
      if (next === null) {
        changed = true
        continue
      }
      if (next !== child) changed = true
      children.push(next)
    }

    if (!changed) return node

    return {
      ...node,
      children: children.length > 0 ? children : undefined,
      size: children.reduce((sum, child) => sum + child.size, 0)
    }
  }

  return prune(root) ?? { ...root, children: undefined, size: 0 }
}

/** Every path in the tree, used for select-all style operations. */
export function collectPaths(node: DiskNode, out: string[] = []): string[] {
  out.push(node.path)
  for (const child of node.children ?? []) collectPaths(child, out)
  return out
}

/**
 * Recursively searches the tree for files or directories matching a query string.
 * Returns up to `limit` matches, sorted by size descending.
 */
export function searchTree(root: DiskNode, query: string, limit = 50): DiskNode[] {
  if (!query) return []
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const results: DiskNode[] = []

  const walk = (node: DiskNode): void => {
    if (isOtherBucket(node)) return

    const nameMatch = node.name.toLowerCase().includes(needle)
    const extMatch = (node.extension ?? '').toLowerCase() === needle.replace(/^\./, '')
    if (nameMatch || extMatch) {
      results.push(node)
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  if (root.children) {
    for (const child of root.children) walk(child)
  }

  results.sort((a, b) => b.size - a.size)
  return results.slice(0, limit)
}
