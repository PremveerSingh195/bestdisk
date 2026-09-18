import { interpolateRgbBasis } from 'd3'
import type { ColorMode, FileCategory } from '@shared/types'
import { CATEGORY_COLORS } from '@shared/categorize'

/**
 * Curated, high-contrast, harmonious palettes for hierarchical branches.
 * Matches the signature aesthetic of macOS visualizers like DaisyDisk and Baobab.
 * Designed to look vibrant and distinct against dark and light canvas backgrounds.
 */
export interface BranchPalette {
  name: string
  border: string
  headerBg: string
  headerText: string
  tileFill: string
  tileBorder: string
}

export const BRANCH_PALETTES: BranchPalette[] = [
  // 0. Ocean Blue (Primary branch)
  {
    name: 'Blue',
    border: '#60a5fa',
    headerBg: '#1d4ed8',
    headerText: '#ffffff',
    tileFill: '#2563eb',
    tileBorder: '#93c5fd'
  },
  // 1. Emerald Green
  {
    name: 'Emerald',
    border: '#34d399',
    headerBg: '#047857',
    headerText: '#ffffff',
    tileFill: '#059669',
    tileBorder: '#6ee7b7'
  },
  // 2. Amber Gold
  {
    name: 'Amber',
    border: '#fbbf24',
    headerBg: '#b45309',
    headerText: '#ffffff',
    tileFill: '#d97706',
    tileBorder: '#fde68a'
  },
  // 3. Royal Purple
  {
    name: 'Purple',
    border: '#a78bfa',
    headerBg: '#6d28d9',
    headerText: '#ffffff',
    tileFill: '#7c3aed',
    tileBorder: '#c4b5fd'
  },
  // 4. Vibrant Coral / Rose
  {
    name: 'Rose',
    border: '#fb7185',
    headerBg: '#be123c',
    headerText: '#ffffff',
    tileFill: '#e11d48',
    tileBorder: '#fca5a5'
  },
  // 5. Cyan / Aqua
  {
    name: 'Cyan',
    border: '#22d3ee',
    headerBg: '#0e7490',
    headerText: '#ffffff',
    tileFill: '#0891b2',
    tileBorder: '#a5f3fc'
  },
  // 6. Sunset Orange
  {
    name: 'Orange',
    border: '#fb923c',
    headerBg: '#c2410c',
    headerText: '#ffffff',
    tileFill: '#ea580c',
    tileBorder: '#fdba74'
  },
  // 7. Indigo / Ultramarine
  {
    name: 'Indigo',
    border: '#818cf8',
    headerBg: '#4338ca',
    headerText: '#ffffff',
    tileFill: '#4f46e5',
    tileBorder: '#c7d2fe'
  },
  // 8. Fresh Lime
  {
    name: 'Lime',
    border: '#a3e635',
    headerBg: '#4d7c0f',
    headerText: '#ffffff',
    tileFill: '#65a30d',
    tileBorder: '#d9f99d'
  },
  // 9. Berry Pink / Fuchsia
  {
    name: 'Pink',
    border: '#f472b6',
    headerBg: '#be185d',
    headerText: '#ffffff',
    tileFill: '#db2777',
    tileBorder: '#fbcfe8'
  },
  // 10. Turquoise Teal
  {
    name: 'Teal',
    border: '#2dd4bf',
    headerBg: '#0f766e',
    headerText: '#ffffff',
    tileFill: '#0d9488',
    tileBorder: '#99f6e4'
  },
  // 11. Titanium Slate
  {
    name: 'Slate',
    border: '#94a3b8',
    headerBg: '#334155',
    headerText: '#ffffff',
    tileFill: '#475569',
    tileBorder: '#cbd5e1'
  }
]

export function getBranchPalette(index: number): BranchPalette {
  return BRANCH_PALETTES[Math.abs(index) % BRANCH_PALETTES.length]
}

/** Hashes a string name into a consistent branch index. */
export function hashBranch(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Calibrated size ramp:
 * < 1 MB: Slate
 * 10 MB: Sky Blue
 * 100 MB: Cyan
 * 500 MB: Royal Blue
 * 2 GB: Purple
 * 10 GB: Amber
 * > 25 GB: Vivid Crimson Red
 */
const SIZE_RAMP = interpolateRgbBasis([
  '#64748b', // < 1 MB (Slate)
  '#0284c7', // ~10 MB (Sky Blue)
  '#06b6d4', // ~50 MB (Cyan)
  '#2563eb', // ~250 MB (Royal Blue)
  '#7c3aed', // ~1 GB (Violet Purple)
  '#f59e0b', // ~5 GB (Amber)
  '#ef4444'  // > 20 GB (Vivid Red)
])

const MIN_LOG = Math.log(1024 * 1024) // 1 MB
const MAX_LOG = Math.log(30 * 1024 ** 3) // 30 GB

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** High-contrast colour for byte size on logarithmic scale. */
export function sizeColor(size: number): string {
  if (size <= 1024 * 100) return '#475569' // < 100 KB: muted slate
  const t = clamp01((Math.log(size) - MIN_LOG) / (MAX_LOG - MIN_LOG))
  return SIZE_RAMP(t)
}

/** Newer files are emerald/blue, older drift through amber to red. */
const AGE_RAMP = interpolateRgbBasis([
  '#10b981', // < 1 mo: Emerald
  '#0ea5e9', // 1-6 mo: Sky Blue
  '#eab308', // 6-12 mo: Gold
  '#f97316', // 1-2 yr: Orange
  '#ef4444'  // > 2 yr: Red
])

const MAX_AGE_MS = 2.5 * 365 * 24 * 60 * 60 * 1000 // 2.5 years

export function ageColor(modifiedAt?: number): string {
  if (!modifiedAt) return '#64748b'
  const age = Math.max(0, Date.now() - modifiedAt)
  return AGE_RAMP(clamp01(age / MAX_AGE_MS))
}

export function categoryColor(category?: FileCategory): string {
  return CATEGORY_COLORS[category ?? 'Other'] ?? '#64748b'
}

/** Unified color resolver supporting folder, category, size, and age modes. */
export function colorFor(
  size: number,
  mode: ColorMode,
  modifiedAt?: number,
  category?: FileCategory,
  branchIndex = 0
): string {
  if (mode === 'folder') {
    return getBranchPalette(branchIndex).tileFill
  }
  if (mode === 'category') {
    return categoryColor(category)
  }
  if (mode === 'age') {
    return ageColor(modifiedAt)
  }
  return sizeColor(size)
}

export type SizeBucket = 'tiny' | 'small' | 'medium' | 'large' | 'huge'

const MB = 1024 ** 2
const GB = 1024 ** 3

export function sizeBucket(size: number): SizeBucket {
  if (size < 10 * MB) return 'tiny'
  if (size < 100 * MB) return 'small'
  if (size < GB) return 'medium'
  if (size < 10 * GB) return 'large'
  return 'huge'
}

export const BUCKET_COLORS: Record<SizeBucket, string> = {
  tiny: '#64748b',   // < 10 MB
  small: '#06b6d4',  // 10 MB – 100 MB
  medium: '#2563eb', // 100 MB – 1 GB
  large: '#7c3aed',  // 1 GB – 10 GB
  huge: '#ef4444'    // > 10 GB
}

export const BUCKET_LABELS: Record<SizeBucket, string> = {
  tiny: '< 10 MB',
  small: '10 MB – 100 MB',
  medium: '100 MB – 1 GB',
  large: '1 GB – 10 GB',
  huge: '> 10 GB'
}
