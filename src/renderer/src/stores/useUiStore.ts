import { create } from 'zustand'
import type { DiskNode, FileInfo } from '@shared/types'

export type ThemePreference = 'system' | 'dark' | 'light'
export type RightTab = 'details' | 'largest' | 'duplicates' | 'old-files'
export type ActiveNav = 'analyzer' | 'uninstaller' | 'search'

const THEME_KEY = 'disklens.theme'
const SIDEBAR_KEY = 'disklens.sidebarCollapsed'

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  } catch {
    // Ignore quota failures.
  }
}

function readTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    // Ignore unavailable storage.
  }
  return 'system'
}

function writeTheme(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Ignore quota failures.
  }
}

export interface ContextMenuState {
  x: number
  y: number
  node: DiskNode
}

/**
 * A third store beyond the two in the spec: theme, hover and transient menu
 * state are neither scan data nor selection data, and mixing them into either
 * would make both harder to reason about.
 */
export interface UiState {
  activeNav: ActiveNav
  theme: ThemePreference
  hovered: DiskNode | null
  contextMenu: ContextMenuState | null
  rightTab: RightTab
  /** Sidebar visibility is toggled by the toolbar to give the charts room. */
  sidebarCollapsed: boolean
  /** Result of a "Get Info" request, rendered by the details panel. */
  liveInfo: { path: string; info: FileInfo } | null

  setActiveNav: (nav: ActiveNav) => void
  setTheme: (theme: ThemePreference) => void
  cycleTheme: () => void
  setHovered: (node: DiskNode | null) => void
  openContextMenu: (x: number, y: number, node: DiskNode) => void
  closeContextMenu: () => void
  setRightTab: (tab: RightTab) => void
  toggleSidebar: () => void
  showLiveInfo: (path: string, info: FileInfo) => void
  clearLiveInfo: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeNav: 'analyzer',
  theme: readTheme(),
  hovered: null,
  contextMenu: null,
  rightTab: 'details',
  sidebarCollapsed: readSidebarCollapsed(),
  liveInfo: null,

  setActiveNav: (activeNav) => set({ activeNav }),

  setTheme: (theme) => {
    writeTheme(theme)
    set({ theme })
  },

  cycleTheme: () => {
    const order: ThemePreference[] = ['system', 'dark', 'light']
    const current = order.indexOf(get().theme)
    const next = order[(current + 1) % order.length] ?? 'system'
    writeTheme(next)
    set({ theme: next })
  },

  setHovered: (hovered) => {
    if (get().hovered === hovered) return
    set({ hovered })
  },

  openContextMenu: (x, y, node) => set({ contextMenu: { x, y, node } }),
  closeContextMenu: () => set({ contextMenu: null }),

  setRightTab: (rightTab) => set({ rightTab }),

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    writeSidebarCollapsed(next)
    set({ sidebarCollapsed: next })
  },

  showLiveInfo: (path, info) => set({ liveInfo: { path, info }, rightTab: 'details' }),

  clearLiveInfo: () => set({ liveInfo: null })
}))

/** Applies the theme preference to `<html data-theme>` so CSS can react to it. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
