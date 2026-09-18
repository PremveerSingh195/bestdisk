import { useEffect, useRef, useState } from 'react'
import { FolderSearch } from 'lucide-react'
import { useScanStore } from '@renderer/stores/useScanStore'
import { formatBytes, formatCount, truncatePath } from '@renderer/utils/formatBytes'
import { Button } from './Primitives'

export function ScanProgress(): JSX.Element | null {
  const scanning = useScanStore((state) => state.scanning)
  const progress = useScanStore((state) => state.progress)
  const scanPath = useScanStore((state) => state.scanPath)
  const cancelScan = useScanStore((state) => state.cancelScan)

  const startTime = useRef(0)
  const [elapsed, setElapsed] = useState(0)

  // Reset the timer when scanning starts, tick every 250ms.
  useEffect(() => {
    if (!scanning) {
      setElapsed(0)
      return undefined
    }
    startTime.current = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 250)
    return () => window.clearInterval(id)
  }, [scanning])

  if (!scanning) return null

  const files = progress?.scannedFiles ?? 0
  const dirs = progress?.scannedDirs ?? 0
  const bytes = progress?.bytesFound ?? 0
  const current = progress?.currentPath ?? scanPath ?? ''

  const speed = elapsed > 0 ? Math.round(files / elapsed) : 0

  const formatElapsed = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  return (
    <div className="absolute inset-0 z-40 flex animate-fade-in items-center justify-center bg-[var(--bg-canvas)]/70 backdrop-blur-md">
      <div className="flex w-[420px] flex-col items-center gap-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-7 text-center shadow-2xl backdrop-blur-2xl">
        {/* Indeterminate ring: two arcs rotating at different speeds. */}
        <div className="relative h-20 w-20">
          <svg viewBox="0 0 100 100" className="h-full w-full animate-spin">
            <defs>
              <linearGradient id="scan-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-blue)" />
                <stop offset="100%" stopColor="var(--accent-purple)" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--bg-hover)"
              strokeWidth="6"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#scan-ring)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="90 174"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <FolderSearch className="h-6 w-6 text-[var(--accent-blue)]" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-title font-semibold">
            Scanning… <span className="tabular-nums text-[var(--text-secondary)]">{formatElapsed(elapsed)}</span>
          </h2>
          <p className="text-body text-[var(--text-secondary)]">
            Reading every file so the chart adds up to what is really on disk.
          </p>
        </div>

        <div className="w-full space-y-2">
          <div className="flex items-baseline justify-between text-body">
            <span className="font-medium tabular-nums">{formatBytes(bytes)} found</span>
            <span className="text-[var(--text-secondary)] tabular-nums">
              {formatCount(files)} files · {formatCount(dirs)} folders
            </span>
          </div>

          {speed > 0 ? (
            <p className="text-label tabular-nums text-[var(--accent-blue)]">
              ~{formatCount(speed)} files/sec
            </p>
          ) : null}

          <p
            data-selectable
            className="truncate rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] px-2 py-1.5 text-left font-mono text-label text-[var(--text-tertiary)]"
            title={current}
          >
            {truncatePath(current, 3)}
          </p>
        </div>

        <Button variant="secondary" onClick={cancelScan}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
