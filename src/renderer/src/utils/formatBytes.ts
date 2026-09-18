const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/** Human-readable size: 0 B, 1.4 MB, 12 GB … */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exponent

  // Keep the output to three significant figures at most.
  const digits = exponent === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : decimals
  return `${value.toFixed(digits)} ${UNITS[exponent]}`
}

const countFormatter = new Intl.NumberFormat('en-US')

export function formatCount(value: number): string {
  return countFormatter.format(value)
}

/** `formatCount` with a singular/plural noun: "1,204 files". */
export function formatItems(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`
}

export function formatPercent(part: number, total: number, decimals = 0): string {
  if (total <= 0) return '0%'
  return `${((part / total) * 100).toFixed(decimals)}%`
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** "3 days ago" style output for the file-age colour legend. */
export function formatRelativeDate(timestamp?: number): string {
  if (!timestamp) return 'Unknown'

  const seconds = Math.max(0, (Date.now() - timestamp) / 1000)
  const table: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month']
  ]

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  let value = seconds
  for (const [step, unit] of table) {
    if (value < step) return formatter.format(-Math.round(value), unit)
    value /= step
  }
  return formatter.format(-Math.round(value), 'year')
}

/** Truncates a long path from the left, keeping the last `maxSegments`. */
export function truncatePath(fullPath: string, maxSegments = 3): string {
  const segments = fullPath.split('/').filter(Boolean)
  if (segments.length <= maxSegments) return fullPath
  return `…/${segments.slice(-maxSegments).join('/')}`
}
