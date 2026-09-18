import type { ColorMode } from '@shared/types'
import { BRANCH_PALETTES, BUCKET_COLORS, BUCKET_LABELS } from '@renderer/utils/colorScale'
import { CATEGORY_COLORS } from '@shared/categorize'

const SIZE_STOPS = ['tiny', 'small', 'medium', 'large', 'huge'] as const

const AGE_STOPS = [
  { label: '< 1 mo', color: '#10b981' },
  { label: '1–6 mo', color: '#0ea5e9' },
  { label: '6–12 mo', color: '#eab308' },
  { label: '1–2 yr', color: '#f97316' },
  { label: '> 2 yr', color: '#ef4444' }
] as const

const CATEGORY_STOPS = [
  { label: 'Video', color: CATEGORY_COLORS.Videos },
  { label: 'Doc', color: CATEGORY_COLORS.Documents },
  { label: 'Code', color: CATEGORY_COLORS.Development },
  { label: 'App', color: CATEGORY_COLORS.Applications },
  { label: 'Archive', color: CATEGORY_COLORS.Archives },
  { label: 'Image', color: CATEGORY_COLORS.Images },
  { label: 'System', color: CATEGORY_COLORS.System }
] as const

export function ColorLegend({ mode }: { mode: ColorMode }): JSX.Element {
  if (mode === 'folder') {
    return (
      <div className="pointer-events-none flex items-center gap-1.5 text-label text-[var(--text-tertiary)]">
        <span className="font-medium text-[var(--text-secondary)]">Folder:</span>
        <div className="flex items-center -space-x-1">
          {BRANCH_PALETTES.slice(0, 6).map((p) => (
            <span
              key={p.name}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-[var(--bg-primary)]"
              style={{ backgroundColor: p.tileFill }}
              title={p.name}
            />
          ))}
        </div>
        <span className="text-[10px]">Distinct branches</span>
      </div>
    )
  }

  if (mode === 'category') {
    return (
      <div className="pointer-events-none flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="shrink-0 text-label text-[var(--text-tertiary)]">Type:</span>
        {CATEGORY_STOPS.map((stop) => (
          <span key={stop.label} className="flex shrink-0 items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stop.color }} />
            <span className="text-[10px] text-[var(--text-secondary)]">{stop.label}</span>
          </span>
        ))}
      </div>
    )
  }

  if (mode === 'age') {
    return (
      <div className="pointer-events-none flex items-center gap-2.5">
        <span className="text-label text-[var(--text-tertiary)]">Age:</span>
        {AGE_STOPS.map((stop) => (
          <span key={stop.label} className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: stop.color }} />
            <span className="text-[10px] text-[var(--text-secondary)]">{stop.label}</span>
          </span>
        ))}
      </div>
    )
  }

  // Size mode
  return (
    <div className="pointer-events-none flex items-center gap-2.5">
      <span className="text-label text-[var(--text-tertiary)]">Size:</span>
      {SIZE_STOPS.map((bucket) => (
        <span key={bucket} className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: BUCKET_COLORS[bucket] }} />
          <span className="text-[10px] text-[var(--text-secondary)]">{BUCKET_LABELS[bucket]}</span>
        </span>
      ))}
    </div>
  )
}
