import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'
import type { DiskNode } from '@shared/types'
import { ConfirmProvider, useConfirm } from './components/Dialogs'
import { AppUninstaller } from './components/AppUninstaller'
import { CleanupDrawer } from './components/CleanupDrawer'
import { ContextMenu } from './components/ContextMenu'
import { DetailPanel } from './components/DetailPanel'
import { DiskBar } from './components/DiskBar'
import { EmptyState } from './components/EmptyState'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FileList } from './components/FileList'
import { PermissionBanner } from './components/PermissionBanner'
import { ScanProgress } from './components/ScanProgress'
import { Sidebar } from './components/Sidebar'
import { SmartSearch } from './components/SmartSearch'
import { StatusBar } from './components/StatusBar'
import { SunburstChart } from './components/SunburstChart'
import { FILTER_INPUT_ID, ToolBar } from './components/ToolBar'
import { TreemapChart } from './components/TreemapChart'
import { useFileActions } from './hooks/useFileActions'
import { activeDisk, currentDirectory, useScanStore } from './stores/useScanStore'
import { useSelectionStore } from './stores/useSelectionStore'
import { applyTheme, useUiStore } from './stores/useUiStore'
import { formatBytes } from './utils/formatBytes'

const VIEW_LABELS = {
  sunburst: 'Sunburst chart',
  treemap: 'Treemap chart',
  list: 'file list'
} as const

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function TitleBar(): JSX.Element {
  return (
    <header className="drag-region flex h-[38px] shrink-0 items-center justify-center border-b border-[var(--border)] bg-[var(--bg-glass)] backdrop-blur-2xl">
      <span className="text-label font-semibold tracking-wide text-[var(--text-secondary)]">
        Bestdisk
      </span>
    </header>
  )
}

function NoticeToast(): JSX.Element | null {
  const notice = useScanStore((state) => state.notice)
  const setNotice = useScanStore((state) => state.setNotice)

  // Auto-dismiss transient notices so they cannot pile up.
  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice, setNotice])

  if (!notice) return null

  return (
    <div className="fixed bottom-5 right-5 z-[70] flex max-w-[380px] animate-slide-up items-start gap-2 rounded-xl border border-[var(--accent-orange)]/40 bg-[var(--bg-primary)] px-3 py-2.5 shadow-2xl backdrop-blur-2xl">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-orange)]" strokeWidth={1.75} />
      <p className="flex-1 text-body text-[var(--text-secondary)]">{notice}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setNotice(null)}
        className="rounded-md p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ErrorBanner(): JSX.Element | null {
  const error = useScanStore((state) => state.error)
  const clearError = useScanStore((state) => state.clearError)

  if (!error) return null

  return (
    <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 p-3">
      <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-red)]" strokeWidth={2} />
      <p className="flex-1 text-body text-[var(--text-secondary)]">{error}</p>
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={clearError}
        className="rounded-md p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function AppShell(): JSX.Element {
  const activeNav = useUiStore((state) => state.activeNav)
  const theme = useUiStore((state) => state.theme)
  const view = useScanStore((state) => state.view)
  const setView = useScanStore((state) => state.setView)
  const root = useScanStore((state) => state.root)
  const startScan = useScanStore((state) => state.startScan)
  const rescan = useScanStore((state) => state.rescan)
  const zoomOut = useScanStore((state) => state.zoomOut)
  const loadDisks = useScanStore((state) => state.loadDisks)
  const refreshPermissions = useScanStore((state) => state.refreshPermissions)
  const applyProgress = useScanStore((state) => state.applyProgress)
  const applyComplete = useScanStore((state) => state.applyComplete)
  const applyError = useScanStore((state) => state.applyError)
  const disk = useScanStore(activeDisk)
  const current = useScanStore(currentDirectory)

  const clearSelection = useSelectionStore((state) => state.clear)
  const closeContextMenu = useUiStore((state) => state.closeContextMenu)

  const actions = useFileActions()

  const [completionToast, setCompletionToast] = useState<{ name: string; size: number } | null>(null)

  const handleScanComplete = useCallback(
    (completedRoot: DiskNode) => {
      applyComplete(completedRoot)
      setCompletionToast({
        name: completedRoot.name || completedRoot.path,
        size: completedRoot.size
      })
    },
    [applyComplete]
  )

  useEffect(() => {
    if (!completionToast) return undefined
    const timer = window.setTimeout(() => setCompletionToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [completionToast])

  // ------------------------------------------------------------- theming
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // --------------------------------------------------------- IPC bridge
  useEffect(() => {
    void loadDisks()
    void refreshPermissions()

    const unsubs = [
      window.diskAPI.onScanProgress(applyProgress),
      window.diskAPI.onScanComplete(handleScanComplete),
      window.diskAPI.onScanError(applyError)
    ]
    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [applyComplete, applyError, applyProgress, handleScanComplete, loadDisks, refreshPermissions])

  const confirm = useConfirm()

  const handleStartScan = useCallback(
    async (path: string) => {
      const permissions = useScanStore.getState().permissions
      if (permissions && permissions.fullDiskAccess === false) {
        const ok = await confirm({
          title: 'Full Disk Access Recommended',
          message:
            'To scan your disk without macOS asking for permission for every folder individually, please grant Full Disk Access. Would you like to open System Settings now?',
          confirmLabel: 'Open Settings',
          cancelLabel: 'Scan Anyway'
        })
        if (ok) {
          void window.diskAPI.openFullDiskAccessSettings()
          return
        }
      }
      startScan(path)
    },
    [confirm, startScan]
  )

  const openFolder = useCallback(async (): Promise<void> => {
    const chosen = await window.diskAPI.openFolder()
    if (chosen) void handleStartScan(chosen)
  }, [handleStartScan])

  const scanBootVolume = useCallback((): void => {
    void handleStartScan(disk?.mountPoint ?? '/')
  }, [disk, handleStartScan])

  const selected = useSelectionStore((state) => state.selected)
  const hovered = useUiStore((state) => state.hovered)

  // --------------------------------------------------- keyboard shortcuts
  const trashSelection = useCallback((): void => {
    const nodes = [...selected.values()]
    if (nodes.length > 0) void actions.moveToTrash(nodes)
  }, [actions, selected])

  const quickLookFocus = useCallback((): void => {
    const target = hovered ?? [...selected.values()][0]
    if (target) actions.quickLook(target)
  }, [actions, hovered, selected])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return

      const isMeta = event.metaKey || event.ctrlKey

      if (event.key === 'Escape') {
        closeContextMenu()
        clearSelection()
        return
      }

      if (isMeta && event.shiftKey && event.key.toLowerCase() === 'r') {
        window.location.reload()
        return
      }

      if (isMeta && !event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        const currentPath = useScanStore.getState().scanPath
        if (currentPath) void handleStartScan(currentPath)
        return
      }

      if (isMeta && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        const input = document.getElementById(FILTER_INPUT_ID)
        input?.focus()
        return
      }

      if (isMeta && event.key === 'Backspace') {
        event.preventDefault()
        void trashSelection()
        return
      }

      if (event.key === 'Backspace' && !isMeta) {
        event.preventDefault()
        zoomOut()
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        void quickLookFocus()
        return
      }

      if (event.key === '1') setView('sunburst')
      if (event.key === '2') setView('treemap')
      if (event.key === '3') setView('list')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    clearSelection,
    closeContextMenu,
    quickLookFocus,
    rescan,
    setView,
    trashSelection,
    zoomOut
  ])

  const chart = useMemo(() => {
    if (view === 'list') return <FileList />
    if (view === 'treemap') return <TreemapChart />
    return <SunburstChart />
  }, [view])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        {activeNav === 'uninstaller' ? (
          <AppUninstaller />
        ) : activeNav === 'search' ? (
          <SmartSearch />
        ) : (
          <>
            <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-canvas)]">
              <ToolBar />
              <PermissionBanner />
              <ErrorBanner />
              {root ? <DiskBar /> : null}

              <div className="relative min-h-0 flex-1">
                {root && current ? (
                  <ErrorBoundary label={VIEW_LABELS[view]}>{chart}</ErrorBoundary>
                ) : (
                  <EmptyState onScan={scanBootVolume} onOpenFolder={() => void openFolder()} />
                )}
              </div>

              <CleanupDrawer />
              <ScanProgress />
              <StatusBar />
            </main>

            <DetailPanel />
          </>
        )}
      </div>

      <ContextMenu />
      <NoticeToast />
      {completionToast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-2xl border border-[var(--accent-teal)]/40 bg-[var(--bg-primary)] px-4 py-3 shadow-2xl backdrop-blur-2xl animate-slide-up">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-teal)]/15 text-[var(--accent-teal)]">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-body font-semibold text-[var(--text-primary)]">
              Scan Complete
            </p>
            <p className="truncate max-w-[260px] text-label text-[var(--text-secondary)]">
              {completionToast.name} · {formatBytes(completionToast.size)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setCompletionToast(null)}
            className="ml-2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ConfirmProvider>
      <AppShell />
    </ConfirmProvider>
  )
}
