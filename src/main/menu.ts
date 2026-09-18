import { app, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/**
 * Builds a trimmed application menu.
 *
 * This deliberately omits the default View → Reload item: Electron's stock
 * menu binds Cmd+R to reload, which would shadow the renderer's "rescan"
 * shortcut. DevTools stay available in development only.
 */
export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? ([
              { role: 'pasteAndMatchStyle' },
              { role: 'selectAll' }
            ] satisfies MenuItemConstructorOptions[])
          : ([
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' }
            ] satisfies MenuItemConstructorOptions[]))
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...(isDev
          ? ([
              { type: 'separator' },
              { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
              { role: 'toggleDevTools' }
            ] satisfies MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front' }
            ] satisfies MenuItemConstructorOptions[])
          : ([{ role: 'close' }] satisfies MenuItemConstructorOptions[]))
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: () => {
            void shell.openExternal('https://github.com')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
