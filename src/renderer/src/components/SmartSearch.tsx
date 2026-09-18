import { useEffect, useState } from 'react'
import {
  Archive,
  Eye,
  File,
  FileCode,
  FileText,
  Film,
  Folder,
  HardDrive,
  Home,
  Image,
  Package,
  Search,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import clsx from 'clsx'
import type { SearchKind, SearchScope, SmartSearchResult } from '@shared/types'
import { formatBytes } from '@renderer/utils/formatBytes'
import { Button, Spinner } from './Primitives'
import { useScanStore } from '@renderer/stores/useScanStore'

function getFileIcon(ext: string, kind: string): JSX.Element {
  if (kind === 'folder') return <Folder className="h-4 w-4 text-[var(--accent-blue)]" />
  if (ext === 'app') return <Package className="h-4 w-4 text-[var(--accent-purple)]" />
  if (['mp4', 'mov', 'mkv', 'avi'].includes(ext))
    return <Film className="h-4 w-4 text-[var(--accent-red)]" />
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext))
    return <Image className="h-4 w-4 text-[var(--accent-teal)]" />
  if (['zip', 'tar', 'gz', 'dmg', 'iso'].includes(ext))
    return <Archive className="h-4 w-4 text-[var(--accent-orange)]" />
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'h'].includes(ext))
    return <FileCode className="h-4 w-4 text-[var(--accent-blue)]" />
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext))
    return <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
  return <File className="h-4 w-4 text-[var(--text-tertiary)]" />
}

export function SmartSearch(): JSX.Element {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SearchScope>('all')
  const [kind, setKind] = useState<SearchKind>('all')
  const [minSize, setMinSize] = useState<number>(0)
  const [results, setResults] = useState<SmartSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchDurationMs, setSearchDurationMs] = useState<number | null>(null)
  const setNotice = useScanStore((state) => state.setNotice)

  const isSupported = typeof window.diskAPI?.smartSearch === 'function'

  const performSearch = async (): Promise<void> => {
    if (!isSupported) {
      setLoading(false)
      return
    }
    setLoading(true)
    const startTime = performance.now()
    try {
      const data = await window.diskAPI.smartSearch({
        query,
        scope,
        kind,
        minSize,
        limit: 250
      })
      setResults(data)
      setSearchDurationMs(Math.round(performance.now() - startTime))
    } catch (err) {
      setNotice(`Search error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // Trigger search on mount and when filters change
  useEffect(() => {
    if (!isSupported) return
    const timer = setTimeout(() => {
      void performSearch()
    }, 250)
    return () => clearTimeout(timer)
  }, [query, scope, kind, minSize, isSupported])

  const handleTrash = async (filePath: string): Promise<void> => {
    const res = await window.diskAPI.moveToTrash([filePath])
    if (res.success) {
      setResults((prev) => prev.filter((r) => r.path !== filePath))
      setNotice(`Moved to Trash: ${filePath}`)
    } else {
      setNotice(`Failed to move file to Trash: ${res.failed.join(', ')}`)
    }
  }

  if (!isSupported) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center bg-[var(--bg-canvas)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] mb-4">
          <Search className="h-8 w-8" />
        </div>
        <h2 className="text-title font-semibold text-[var(--text-primary)]">Native Modules Updated</h2>
        <p className="text-label text-[var(--text-secondary)] mt-1.5 max-w-md">
          New native capabilities were compiled into the application. Please reload the window or restart the app to activate them.
        </p>
        <Button
          variant="primary"
          className="mt-4"
          icon={Zap}
          onClick={() => window.location.reload()}
        >
          Reload Window (⌘⇧R)
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg-canvas)]">
      {/* Search Header */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-title font-semibold text-[var(--text-primary)]">
              <Search className="h-5 w-5 text-[var(--accent-blue)]" />
              Smart Search
            </h1>
            <p className="text-label text-[var(--text-secondary)]">
              Blazing fast file indexing powered by native Spotlight metadata
            </p>
          </div>

          {searchDurationMs !== null ? (
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--accent-teal)]/30 bg-[var(--accent-teal)]/10 px-3 py-1 text-label font-medium text-[var(--accent-teal)]">
              <Zap className="h-3.5 w-3.5" />
              <span>
                {results.length} files found in {searchDurationMs}ms
              </span>
            </div>
          ) : null}
        </div>

        {/* Search Bar */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[var(--text-tertiary)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, file extension (e.g. .dmg, .mov, node_modules), or keyword…"
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-glass)] pl-10 pr-9 text-body text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-blue)] focus:outline-none shadow-sm"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 text-label">
          {/* Scope Selector */}
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] p-0.5">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={clsx(
                'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors duration-150',
                scope === 'all'
                  ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <HardDrive className="h-3 w-3" />
              Entire Mac
            </button>
            <button
              type="button"
              onClick={() => setScope('home')}
              className={clsx(
                'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors duration-150',
                scope === 'home'
                  ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <Home className="h-3 w-3" />
              Home Only
            </button>
          </div>

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          {/* Kind Selector */}
          <div className="flex gap-1 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Kinds' },
                { id: 'media', label: 'Media (Videos/Images)' },
                { id: 'docs', label: 'Documents' },
                { id: 'archives', label: 'Archives & DMGs' },
                { id: 'apps', label: 'Applications' },
                { id: 'code', label: 'Source Code' }
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={clsx(
                  'rounded-lg border px-2.5 py-1 font-medium transition-colors duration-150',
                  kind === k.id
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]'
                    : 'border-[var(--border)] bg-[var(--bg-glass)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          {/* Size Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[var(--text-tertiary)]">Min Size:</span>
            <select
              value={minSize}
              onChange={(e) => setMinSize(Number(e.target.value))}
              className="h-7 rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] px-2 text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              <option value={0} className="bg-[var(--bg-primary)]">Any Size</option>
              <option value={10 * 1024 * 1024} className="bg-[var(--bg-primary)]">&gt; 10 MB</option>
              <option value={100 * 1024 * 1024} className="bg-[var(--bg-primary)]">&gt; 100 MB</option>
              <option value={1024 * 1024 * 1024} className="bg-[var(--bg-primary)]">&gt; 1 GB</option>
              <option value={5 * 1024 * 1024 * 1024} className="bg-[var(--bg-primary)]">&gt; 5 GB</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center text-[var(--text-tertiary)]">
            <Spinner className="mb-2 h-6 w-6 text-[var(--accent-blue)]" />
            <p className="text-label">Searching Mac filesystem…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-[var(--text-tertiary)]">
            <Search className="mb-2 h-10 w-10 stroke-[1.25]" />
            <p className="text-body font-medium">No files matched your search criteria</p>
            <p className="text-label mt-1">Try broadening your search query or minimum size filter</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-body">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-primary)]/90 backdrop-blur-md text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 w-28 text-right">Size</th>
                <th className="px-4 py-2 w-32 hidden md:table-cell">Kind</th>
                <th className="px-4 py-2 w-36 hidden lg:table-cell">Modified</th>
                <th className="px-4 py-2 w-48 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {results.map((item) => (
                <tr
                  key={item.path}
                  onDoubleClick={() => void window.diskAPI.quickLook(item.path)}
                  className="group hover:bg-[var(--bg-hover)] transition-colors duration-100"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getFileIcon(item.extension, item.kind)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[13px] text-[var(--text-primary)]">
                          {item.name}
                        </p>
                        <p className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                          {item.path}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-2.5 text-right font-mono text-label tabular-nums font-semibold text-[var(--text-primary)]">
                    {formatBytes(item.size)}
                  </td>

                  <td className="px-4 py-2.5 text-label text-[var(--text-secondary)] uppercase hidden md:table-cell">
                    {item.kind}
                  </td>

                  <td className="px-4 py-2.5 text-label text-[var(--text-tertiary)] hidden lg:table-cell">
                    {new Date(item.modifiedAt).toLocaleDateString()}
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        title="Quick Look (Space)"
                        onClick={() => void window.diskAPI.quickLook(item.path)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void window.diskAPI.revealInFinder(item.path)}
                      >
                        Reveal
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        className="text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
                        onClick={() => void handleTrash(item.path)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
