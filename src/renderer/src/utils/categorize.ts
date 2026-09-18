/**
 * Renderer-side view of the shared categoriser.
 *
 * The mapping itself lives in `src/shared/categorize.ts` because the main
 * process stamps `category` onto every scanned node; re-exporting it here keeps
 * renderer imports short and gives the renderer a single place to add
 * presentation-only helpers.
 */
export {
  CATEGORY_COLORS,
  FILE_CATEGORIES,
  categorize,
  extensionOf
} from '@shared/categorize'

import type { DiskNode, FileCategory } from '@shared/types'

/** Category used to group a node: directories fall back to their own bucket. */
export function categoryOf(node: DiskNode): FileCategory {
  return node.category ?? 'Other'
}
