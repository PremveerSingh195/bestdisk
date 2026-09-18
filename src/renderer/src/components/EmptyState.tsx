import { HardDrive, Keyboard } from 'lucide-react'
import { Button } from './Primitives'

export function EmptyState({
  onScan,
  onOpenFolder
}: {
  onScan: () => void
  onOpenFolder: () => void
}): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[var(--accent-blue)] opacity-20 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-glass)]">
          <HardDrive className="h-9 w-9 text-[var(--accent-blue)]" strokeWidth={1.5} />
        </div>
      </div>

      <div className="max-w-sm space-y-1.5">
        <h2 className="text-title font-semibold">See where your disk space went</h2>
        <p className="text-body text-[var(--text-secondary)]">
          Pick a volume from the sidebar, or choose any folder to scan. DiskLens maps every
          file into an interactive chart you can drill into.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={onScan}>
          Scan this Mac
        </Button>
        <Button variant="secondary" onClick={onOpenFolder}>
          Open Folder…
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-label text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <Keyboard className="h-3 w-3" strokeWidth={1.75} />
          <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">⌘R</kbd> Rescan
        </span>
        <span>
          <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">⌘F</kbd> Filter
        </span>
        <span>
          <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">1</kbd>
          <kbd className="ml-0.5 rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">2</kbd>
          <kbd className="ml-0.5 rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">3</kbd> Switch view
        </span>
        <span>
          <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">Space</kbd> Quick Look
        </span>
      </div>
    </div>
  )
}
