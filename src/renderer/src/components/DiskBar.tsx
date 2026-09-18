import { useMemo, useState } from 'react'
import { activeDisk, useScanStore } from '@renderer/stores/useScanStore'
import { categoryTotals } from '@renderer/utils/tree'
import { formatBytes, formatPercent } from '@renderer/utils/formatBytes'

interface Segment {
  key: string
  label: string
  size: number
  color: string
}

/**
 * Segmented used/free bar for the active volume.
 *
 * The scanned categories are drawn inside the used portion; whatever `df`
 * reports as used but the scan did not attribute (system volumes, purgeable
 * space, files we could not read) becomes an explicit "Unattributed" segment so
 * the numbers never silently fail to add up.
 */
export function DiskBar(): JSX.Element | null {
  const root = useScanStore((state) => state.root)
  const disk = useScanStore(activeDisk)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const segments = useMemo<Segment[]>(() => {
    if (!disk) return []
    const totals = root ? categoryTotals(root) : []
    const attributed = totals.reduce((sum, total) => sum + total.size, 0)

    const list: Segment[] = totals.map((total) => ({
      key: total.category,
      label: total.category,
      size: total.size,
      color: total.color
    }))

    const unaccounted = Math.max(0, disk.used - attributed)
    if (unaccounted > 0) {
      list.push({
        key: '__unattributed__',
        label: 'Unattributed',
        size: unaccounted,
        color: 'var(--text-tertiary)'
      })
    }

    list.push({
      key: '__free__',
      label: 'Free',
      size: Math.max(0, disk.total - disk.used),
      color: 'var(--bg-hover)'
    })

    return list
  }, [disk, root])

  if (!disk) return null

  const total = segments.reduce((sum, segment) => sum + segment.size, 0) || 1
  const hovered = segments.find((segment) => segment.key === hoveredKey) ?? null

  return (
    <div className="px-6 pt-3.5 pb-4 border-b border-[var(--border)] shrink-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-body font-semibold">{disk.label}</h2>
          <span className="text-label text-[var(--text-tertiary)]">
            {root ? `scanning ${root.path}` : disk.mountPoint}
          </span>
        </div>
        <p className="text-label tabular-nums text-[var(--text-secondary)]">
          {hovered
            ? `${hovered.label} · ${formatBytes(hovered.size)} · ${formatPercent(hovered.size, total)}`
            : `${formatBytes(disk.total - disk.free)} used of ${formatBytes(disk.total)}`}
        </p>
      </div>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
        {segments.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label} — ${formatBytes(segment.size)} (${formatPercent(segment.size, total)})`}
            onMouseEnter={() => setHoveredKey(segment.key)}
            onMouseLeave={() => setHoveredKey(null)}
            className="mac-ease h-full transition-opacity duration-150"
            style={{
              width: `${(segment.size / total) * 100}%`,
              backgroundColor: segment.color,
              opacity: hoveredKey && hoveredKey !== segment.key ? 0.45 : 1
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {segments
          .filter((segment) => segment.size > 0)
          .map((segment) => (
            <button
              key={segment.key}
              type="button"
              onMouseEnter={() => setHoveredKey(segment.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className="flex items-center gap-1.5 text-label text-[var(--text-secondary)]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              {segment.label}
              <span className="tabular-nums text-[var(--text-tertiary)]">
                {formatBytes(segment.size)}
              </span>
            </button>
          ))}
      </div>
    </div>
  )
}
