import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { cancelAllWork, registerIpcHandlers } from './ipc'
import { buildApplicationMenu } from './menu'

/**
 * Note on the spec: `app.requestSingleInstanceFocus()` does not exist. The
 * supported pattern is `requestSingleInstanceLock()` plus a `second-instance`
 * listener, which is what is implemented below.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Bestdisk',
    // Transparent background so the vibrancy material shows through.
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    // The spec's { x: 16, y: 18 } places the buttons below a 28px bar; the
    // renderer draws a 38px title strip, and y: 13 centres them inside it.
    trafficLightPosition: { x: 16, y: 13 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Never let the app open a second window; send links to the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

void app.whenReady().then(() => {
  buildApplicationMenu()
  registerIpcHandlers()
  createWindow()

  // macOS: clicking the dock icon with no windows open re-creates one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // Do not leave a scanner walking the filesystem after the app is gone.
  cancelAllWork()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
