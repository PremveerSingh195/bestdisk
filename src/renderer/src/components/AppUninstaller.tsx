import { useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  ExternalLink,
  Package,
  RefreshCw,
  Search,
  Square,
  Trash2
} from 'lucide-react'
import clsx from 'clsx'
import type { AppInfo } from '@shared/types'
import { formatBytes } from '@renderer/utils/formatBytes'
import { Button, Card, Spinner } from './Primitives'
import { useConfirm } from './Dialogs'
import { useScanStore } from '@renderer/stores/useScanStore'

export function AppUninstaller(): JSX.Element {
  const [apps, setApps] = useState<AppInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [selectedLeftovers, setSelectedLeftovers] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'user' | 'large' | 'leftovers'>('all')

  const confirm = useConfirm()
  const setNotice = useScanStore((state) => state.setNotice)

  const isSupported = typeof window.diskAPI?.listApps === 'function'

  const loadApps = async (): Promise<void> => {
    if (!isSupported) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await window.diskAPI.listApps()
      setApps(data)
      if (data.length > 0 && !selectedAppId) {
        setSelectedAppId(data[0].id)
        setSelectedLeftovers(new Set(data[0].leftovers.map((l) => l.path)))
      }
    } catch (err) {
      setNotice(`Failed to load applications: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApps()
  }, [])

  const selectedApp = useMemo(
    () => apps.find((a) => a.id === selectedAppId) || null,
    [apps, selectedAppId]
  )

  // Whenever selected app changes, select all its leftovers by default
  useEffect(() => {
    if (selectedApp) {
      setSelectedLeftovers(new Set(selectedApp.leftovers.map((l) => l.path)))
    }
  }, [selectedAppId])

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesSearch =
        !search.trim() ||
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.bundleId?.toLowerCase().includes(search.toLowerCase())

      if (!matchesSearch) return false

      if (filterType === 'user') return !app.isSystemApp
      if (filterType === 'large') return app.totalSize >= 500 * 1024 * 1024 // > 500MB
      if (filterType === 'leftovers') return app.leftovers.length > 0
      return true
    })
  }, [apps, search, filterType])

  const toggleLeftover = (path: string): void => {
    setSelectedLeftovers((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const toggleAllLeftovers = (): void => {
    if (!selectedApp) return
    if (selectedLeftovers.size === selectedApp.leftovers.length) {
      setSelectedLeftovers(new Set())
    } else {
      setSelectedLeftovers(new Set(selectedApp.leftovers.map((l) => l.path)))
    }
  }

  const handleUninstall = async (): Promise<void> => {
    if (!selectedApp) return

    const leftoverPaths = Array.from(selectedLeftovers)
    const totalFreed =
      selectedApp.appSize +
      selectedApp.leftovers
        .filter((l) => selectedLeftovers.has(l.path))
        .reduce((acc, l) => acc + l.size, 0)

    const ok = await confirm({
      title: `Uninstall ${selectedApp.name}?`,
      message: `This will move "${selectedApp.name}" and ${leftoverPaths.length} associated leftover items (${formatBytes(totalFreed)}) to the macOS Trash.`,
      confirmLabel: 'Move to Trash',
      destructive: true
    })

    if (!ok) return

    setNotice(`Uninstalling ${selectedApp.name}…`)
    try {
      const res = await window.diskAPI.uninstallApp(selectedApp.appPath, leftoverPaths)
      if (res.success) {
        setNotice(`Successfully uninstalled ${selectedApp.name} and freed ${formatBytes(totalFreed)} to Trash.`)
        // Remove app from state
        setApps((prev) => prev.filter((a) => a.id !== selectedApp.id))
        setSelectedAppId(null)
      } else {
        setNotice(`Failed to uninstall some items: ${res.failed.join(', ')}`)
      }
    } catch (err) {
      setNotice(`Uninstall error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const totalSelectedReclaim = useMemo(() => {
    if (!selectedApp) return 0
    const leftoversSize = selectedApp.leftovers
      .filter((l) => selectedLeftovers.has(l.path))
      .reduce((acc, l) => acc + l.size, 0)
    return selectedApp.appSize + leftoversSize
  }, [selectedApp, selectedLeftovers])

  if (!isSupported) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center bg-[var(--bg-canvas)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] mb-4">
          <Package className="h-8 w-8" />
        </div>
        <h2 className="text-title font-semibold text-[var(--text-primary)]">Native Modules Updated</h2>
        <p className="text-label text-[var(--text-secondary)] mt-1.5 max-w-md">
          New native capabilities were compiled into the application. Please reload the window or restart the app to activate them.
        </p>
        <Button
          variant="primary"
          className="mt-4"
          icon={RefreshCw}
          onClick={() => window.location.reload()}
        >
          Reload Window (⌘⇧R)
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg-canvas)]">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-title font-semibold text-[var(--text-primary)]">
            <Package className="h-5 w-5 text-[var(--accent-blue)]" />
            App Uninstaller
          </h1>
          <p className="text-label text-[var(--text-secondary)]">
            Completely remove applications and all their hidden caches, logs, and preference files
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={() => void loadApps()}
          >
            Refresh Apps
          </Button>
        </div>
      </div>

      {/* Main Split Content */}
      <div className="flex min-h-0 flex-1">
        {/* Left Column: App List */}
        <div className="flex w-[340px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-primary)]/50">
          {/* Search & Filter Bar */}
          <div className="space-y-2 border-b border-[var(--border)] p-3">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search applications…"
                className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] pl-8 pr-3 text-body text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-blue)] focus:outline-none"
              />
            </div>

            {/* Quick Filter Tags */}
            <div className="flex gap-1 overflow-x-auto text-[11px]">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'user', label: 'User' },
                  { id: 'large', label: '> 500 MB' },
                  { id: 'leftovers', label: 'Leftovers' }
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterType(f.id)}
                  className={clsx(
                    'rounded-md px-2 py-0.5 font-medium transition-colors duration-150',
                    filterType === f.id
                      ? 'bg-[var(--accent-blue)] text-white'
                      : 'bg-[var(--bg-glass)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* App List Scroll */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-8 text-[var(--text-tertiary)]">
                <Spinner className="mb-2 h-6 w-6" />
                <p className="text-label">Scanning installed applications…</p>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="p-8 text-center text-label text-[var(--text-tertiary)]">
                No matching applications found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredApps.map((app) => {
                  const isSelected = app.id === selectedAppId
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedAppId(app.id)}
                      className={clsx(
                        'mac-ease flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-all duration-150',
                        isSelected
                          ? 'border border-[var(--accent-blue)]/50 bg-[var(--accent-blue)]/10 text-[var(--text-primary)] shadow-sm'
                          : 'border border-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[var(--accent-blue)]">
                        <Package className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[13px] text-[var(--text-primary)]">
                          {app.name}
                        </p>
                        <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                          {app.version ? `v${app.version}` : app.bundleId || 'Application'}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-mono text-label font-semibold text-[var(--text-primary)]">
                          {formatBytes(app.totalSize)}
                        </p>
                        {app.leftovers.length > 0 ? (
                          <span className="inline-block rounded-full bg-[var(--accent-teal)]/15 px-1.5 py-0.2 text-[10px] font-medium text-[var(--accent-teal)]">
                            +{app.leftovers.length} leftovers
                          </span>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: App Detail & Leftovers Inspector */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
          {selectedApp ? (
            <div className="mx-auto max-w-3xl space-y-6">
              {/* App Overview Card */}
              <Card className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] shadow-inner">
                    <Package className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-title font-semibold text-[var(--text-primary)]">
                        {selectedApp.name}
                      </h2>
                      {selectedApp.isSystemApp ? (
                        <span className="rounded-full bg-[var(--accent-orange)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-orange)]">
                          System App
                        </span>
                      ) : null}
                    </div>
                    <p className="font-mono text-label text-[var(--text-tertiary)]">
                      {selectedApp.bundleId || selectedApp.appPath}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ExternalLink}
                    onClick={() => void window.diskAPI.revealInFinder(selectedApp.appPath)}
                  >
                    Reveal
                  </Button>

                  <Button
                    variant="danger"
                    icon={Trash2}
                    disabled={selectedApp.isSystemApp}
                    onClick={() => void handleUninstall()}
                  >
                    Uninstall ({formatBytes(totalSelectedReclaim)})
                  </Button>
                </div>
              </Card>

              {/* Items Breakdown */}
              <div className="space-y-4">
                {/* 1. App Bundle */}
                <div>
                  <h3 className="mb-2 text-label font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Application Bundle
                  </h3>
                  <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-glass)] p-3">
                    <div className="flex items-center gap-3">
                      <CheckSquare className="h-4 w-4 text-[var(--accent-blue)] shrink-0" />
                      <div>
                        <p className="font-medium text-body text-[var(--text-primary)]">
                          {selectedApp.name}.app
                        </p>
                        <p className="font-mono text-label text-[var(--text-tertiary)] truncate max-w-md">
                          {selectedApp.appPath}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-body font-semibold text-[var(--text-primary)]">
                      {formatBytes(selectedApp.appSize)}
                    </span>
                  </div>
                </div>

                {/* 2. Hidden Leftovers */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-label font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Associated Leftover Files ({selectedApp.leftovers.length})
                    </h3>
                    {selectedApp.leftovers.length > 0 ? (
                      <button
                        type="button"
                        onClick={toggleAllLeftovers}
                        className="text-label text-[var(--accent-blue)] hover:underline"
                      >
                        {selectedLeftovers.size === selectedApp.leftovers.length
                          ? 'Deselect All'
                          : 'Select All'}
                      </button>
                    ) : null}
                  </div>

                  {selectedApp.leftovers.length === 0 ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-glass)] p-4 text-center text-label text-[var(--text-secondary)]">
                      No leftover library files detected for this application. Clean install!
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedApp.leftovers.map((item) => {
                        const checked = selectedLeftovers.has(item.path)
                        return (
                          <div
                            key={item.path}
                            onClick={() => toggleLeftover(item.path)}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-glass)] p-3 transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {checked ? (
                                <CheckSquare className="h-4 w-4 text-[var(--accent-blue)] shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-medium text-body text-[var(--text-primary)]">
                                    {item.name}
                                  </span>
                                  <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--text-tertiary)]">
                                    {item.category}
                                  </span>
                                </div>
                                <p className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                                  {item.path}
                                </p>
                              </div>
                            </div>

                            <span className="ml-4 shrink-0 font-mono text-body text-[var(--text-secondary)]">
                              {formatBytes(item.size)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)]">
              <Package className="mb-3 h-12 w-12 stroke-[1.25]" />
              <p className="text-body font-medium">Select an application to view details and leftovers</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
