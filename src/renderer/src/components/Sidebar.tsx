import {
  Clock,
  Folder,
  HardDrive,
  Package,
  Plug,
  Search,
  Shield,
  Usb,
  Zap
} from 'lucide-react'
import clsx from 'clsx'
import type { DiskInfo } from '@shared/types'
import { activeDisk, currentDirectory, useScanStore } from '@renderer/stores/useScanStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { formatBytes, formatPercent, truncatePath } from '@renderer/utils/formatBytes'
import { Button, ProgressBar } from './Primitives'

function VolumeRow({
  disk,
  active,
  onSelect
}: {
  disk: DiskInfo
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const usedBytes = Math.max(0, disk.total - disk.free)
  const ratio = disk.total > 0 ? usedBytes / disk.total : 0
  // Green when there is room, red when the volume is nearly full.
  const color =
    ratio > 0.9 ? 'var(--accent-red)' : ratio > 0.75 ? 'var(--accent-orange)' : 'var(--accent-blue)'
  const Icon = disk.isRemovable ? Usb : disk.mountPoint === '/' ? HardDrive : Plug

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'mac-ease w-full rounded-lg border border-transparent px-2 py-1.5 text-left transition-all duration-150',
        active
          ? 'border-[var(--border)] bg-[var(--bg-hover)]'
          : 'hover:bg-[var(--bg-hover)]'
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={clsx(
            'h-3.5 w-3.5 shrink-0',
            active ? 'text-[var(--accent-blue)]' : 'text-[var(--text-secondary)]'
          )}
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate text-body font-medium">{disk.label}</span>
        {disk.isRemovable ? (
          <span className="text-label text-[var(--text-tertiary)]">external</span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center gap-2 pl-[22px]">
        <ProgressBar value={usedBytes} max={disk.total} color={color} className="flex-1" />
        <span className="shrink-0 text-label tabular-nums text-[var(--text-tertiary)]">
          {formatPercent(usedBytes, disk.total)}
        </span>
      </div>

      <p className="mt-1 pl-[22px] text-label tabular-nums text-[var(--text-tertiary)]">
        {formatBytes(usedBytes)} used of {formatBytes(disk.total)}
      </p>
    </button>
  )
}

function SectionTitle({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="px-2 pb-1 pt-3 text-label font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
      {children}
    </h2>
  )
}

export function Sidebar(): JSX.Element {
  const activeNav = useUiStore((state) => state.activeNav)
  const setActiveNav = useUiStore((state) => state.setActiveNav)

  const disks = useScanStore((state) => state.disks)
  const root = useScanStore((state) => state.root)
  const scanPath = useScanStore((state) => state.scanPath)
  const history = useScanStore((state) => state.history)
  const pathStack = useScanStore((state) => state.pathStack)
  const startScan = useScanStore((state) => state.startScan)
  const scanning = useScanStore((state) => state.scanning)
  const zoomTo = useScanStore((state) => state.zoomTo)
  const disk = useScanStore(activeDisk)
  const current = useScanStore(currentDirectory)
  const hasDrilldown = pathStack.length > 1

  const openFolder = async (): Promise<void> => {
    const chosen = await window.diskAPI.openFolder()
    if (chosen) startScan(chosen)
  }

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-glass)] backdrop-blur-2xl">
      {/* Primary Section Switcher */}
      <div className="space-y-1 p-2.5 border-b border-[var(--border)]">
        {(
          [
            { id: 'analyzer', label: 'Disk Analyzer', icon: HardDrive },
            { id: 'uninstaller', label: 'App Uninstaller', icon: Package },
            { id: 'search', label: 'Smart Search', icon: Search }
          ] as const
        ).map((item) => {
          const Icon = item.icon
          const active = activeNav === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={clsx(
                'mac-ease flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-body font-medium transition-all duration-150',
                active
                  ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>

      {activeNav === 'analyzer' ? (
        <>
          <div className="flex flex-col gap-2 p-3">
            <Button
              variant="primary"
              className="w-full justify-center"
              icon={HardDrive}
              loading={scanning}
              onClick={() => startScan(disk?.mountPoint ?? '/')}
            >
              Scan Full Mac
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-center"
              icon={Folder}
              disabled={scanning}
              onClick={() => void openFolder()}
            >
              Choose Folder
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
            <SectionTitle>Volumes</SectionTitle>
            <div className="space-y-0.5">
              {disks.length === 0 ? (
                <p className="px-2 py-1 text-label text-[var(--text-tertiary)]">
                  Looking for volumes…
                </p>
              ) : (
                disks.map((entry) => (
                  <VolumeRow
                    key={entry.mountPoint}
                    disk={entry}
                    active={entry.mountPoint === disk?.mountPoint}
                    onSelect={() => startScan(entry.mountPoint)}
                  />
                ))
              )}
            </div>

            {root && pathStack.length > 1 ? (
              <>
                <SectionTitle>Inside</SectionTitle>
                <nav className="space-y-0.5">
                  {pathStack.map((node, index) => {
                    const isCurrent = index === pathStack.length - 1
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => zoomTo(index)}
                        style={{ paddingLeft: 8 + index * 10 }}
                        className={clsx(
                          'mac-ease block w-full truncate rounded-md py-1 pr-2 text-left text-body transition-colors duration-150',
                          isCurrent
                            ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                        )}
                        title={node.path}
                      >
                        {index === 0 ? node.name || node.path : node.name}
                      </button>
                    )
                  })}
                </nav>
              </>
            ) : null}

            {hasDrilldown && current ? (
              <p
                data-selectable
                className="mx-2 mt-2 truncate font-mono text-label text-[var(--text-tertiary)]"
                title={current.path}
              >
                {truncatePath(current.path, 2)}
              </p>
            ) : null}

            {history.length > 0 ? (
              <>
                <SectionTitle>Recent scans</SectionTitle>
                <div className="space-y-0.5">
                  {history.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => startScan(entry)}
                      title={entry}
                      className={clsx(
                        'mac-ease flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-[var(--bg-hover)]',
                        entry === scanPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                      )}
                    >
                      <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                      <span className="truncate text-label">{truncatePath(entry, 2)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 p-3 text-label text-[var(--text-secondary)]">
          {activeNav === 'uninstaller' ? (
            <div className="space-y-3">
              <p className="font-medium text-[var(--text-primary)]">App Cleaner</p>
              <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
                Scans macOS Application bundles and detects all associated Library caches, preferences, and container junk.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium text-[var(--text-primary)]">Spotlight Search</p>
              <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
                Instant indexed file search across your Mac. Filter by size thresholds, file types, or full path.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Persistent Privacy & Silicon Trust Badges */}
      <div className="border-t border-[var(--border)] p-2.5 space-y-1 bg-[var(--bg-glass)] text-[10px] text-[var(--text-tertiary)]">
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-[var(--accent-teal)]" />
            <span className="font-semibold uppercase tracking-wider">Privacy First</span>
          </div>
          <span className="text-[9px] text-[var(--accent-teal)] font-medium">100% Local</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-[var(--accent-blue)]" />
          <span>Apple Silicon Native</span>
        </div>
      </div>
    </aside>
  )
}
