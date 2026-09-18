import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { DiskNode } from '@shared/types'
import { categoryTotals } from '@renderer/utils/tree'
import { formatBytes, formatPercent } from '@renderer/utils/formatBytes'

/**
 * Category summary for the current directory.
 *
 * Recharts handles the donut (secondary stat chart); the D3 charts remain the
 * primary visualisation. The legend doubles as a breakdown table so the exact
 * numbers are always available, not just the shape.
 */
export function CategoryBreakdown({ node }: { node: DiskNode }): JSX.Element | null {
  const totals = useMemo(() => categoryTotals(node), [node])
  const total = useMemo(() => totals.reduce((sum, entry) => sum + entry.size, 0), [totals])

  if (totals.length === 0 || total === 0) return null

  const data = totals.map((entry) => ({
    name: entry.category,
    value: entry.size,
    count: entry.count,
    color: entry.color
  }))

  return (
    <div className="space-y-2">
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="space-y-1">
        {totals.map((entry) => (
          <li key={entry.category} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="truncate text-body">{entry.category}</span>
              </span>
              <span className="shrink-0 text-label tabular-nums text-[var(--text-secondary)]">
                {formatBytes(entry.size)}
                <span className="ml-1 text-[var(--text-tertiary)]">
                  {formatPercent(entry.size, total)}
                </span>
              </span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(entry.size / total) * 100}%`,
                  backgroundColor: entry.color
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
