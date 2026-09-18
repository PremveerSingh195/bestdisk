/**
 * Headless renderer probe.
 *
 * Loads the *real* built renderer bundle and the *real* preload script in an
 * off-screen window and drives a full scan over stubbed IPC. It asserts that:
 *   - `window.diskAPI` is exposed with exactly the expected methods
 *   - React mounted and rendered the empty state
 *   - a stubbed `disk:list` reply reaches the sidebar (renderer → preload → IPC
 *     → renderer round trip)
 *   - a stubbed scan renders the sunburst, the treemap and the virtualised list
 *     without a single console error
 *
 * Run with `npm run probe` (after `npm run build`). No window is shown and the
 * process exits non-zero on failure.
 */
const path = require('node:path')
const { app, BrowserWindow, ipcMain } = require('electron')

const ROOT = path.join(__dirname, '..')

/** Must stay in sync with the DiskAPI interface in src/shared/types.ts. */
const EXPECTED_API = [
  'cancelScan',
  'checkPermissions',
  'deleteFiles',
  'findDuplicates',
  'getDiskInfo',
  'getFileInfo',
  'listDisks',
  'moveToTrash',
  'onDuplicateProgress',
  'onScanComplete',
  'onScanError',
  'onScanProgress',
  'openFolder',
  'openFullDiskAccessSettings',
  'platform',
  'quickLook',
  'revealInFinder',
  'startScan'
]

const STUB_VOLUME = {
  mountPoint: '/',
  label: 'Probe Volume',
  total: 100 * 1024 ** 3,
  used: 40 * 1024 ** 3,
  free: 60 * 1024 ** 3,
  filesystem: 'APFS',
  isRemovable: false
}

const MB = 1024 ** 2
const GB = 1024 ** 3
const DAY = 86_400_000

function file(name, parent, size) {
  return {
    id: `${parent}/${name}`.replace('//', '/'),
    name,
    path: `${parent}/${name}`.replace('//', '/'),
    size,
    type: 'file',
    extension: name.includes('.') ? name.split('.').pop() : undefined,
    category: 'Other',
    modifiedAt: Date.now() - 3 * DAY
  }
}

function directory(name, dirPath, children) {
  return {
    id: dirPath,
    name,
    path: dirPath,
    size: children.reduce((sum, child) => sum + child.size, 0),
    type: 'directory',
    children,
    category: 'Other',
    modifiedAt: Date.now() - 10 * DAY
  }
}

/** A small but realistically shaped tree: nested dirs, varied sizes. */
const PROBE_TREE = directory('Probe Volume', '/', [
  directory('Movies', '/Movies', [
    file('blockbuster.mov', '/Movies', 4 * GB),
    file('clip.mov', '/Movies', 300 * MB),
    file('teaser.mov', '/Movies', 120 * MB)
  ]),
  directory('Photos', '/Photos', [
    file('beach.jpg', '/Photos', 8 * MB),
    file('portrait.jpg', '/Photos', 5 * MB)
  ]),
  directory('EmptyFolder', '/EmptyFolder', []),
  file('notes.txt', '/', 2048),
  file('archive.zip', '/', 900 * MB)
])

let failures = 0

function check(label, condition, detail) {
  if (condition) {
    console.log(`  \u2713 ${label}`)
    return
  }
  failures += 1
  console.error(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`)
}

async function evaluate(win, expression) {
  return win.webContents.executeJavaScript(expression)
}

/** Polls an expression until it is truthy, or gives up. */
async function waitFor(win, expression, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  for (; ;) {
    const value = await evaluate(win, expression)
    if (value) return value
    if (Date.now() > deadline) return null
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  ipcMain.handle('disk:list', () => [STUB_VOLUME])
  ipcMain.handle('disk:info', () => STUB_VOLUME)
  ipcMain.handle('system:permissions', () => ({ fullDiskAccess: true }))
  ipcMain.handle('system:openFolder', () => null)

  const consoleErrors = []

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(ROOT, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.on('console-message', (...args) => {
    const details = args[1]
    if (details && typeof details === 'object' && 'message' in details) {
      if (details.level === 'error') consoleErrors.push(details.message)
      return
    }
    const [, level, message] = args
    if (typeof level === 'number' && level >= 3) consoleErrors.push(message)
  })

  // `scan:start` is an ipcRenderer.send, so answer with the stubbed lifecycle.
  ipcMain.on('scan:start', () => {
    win.webContents.send('scan:progress', {
      scannedFiles: 3210,
      scannedDirs: 480,
      currentPath: '/Movies/2024/raw',
      bytesFound: 6.2 * GB
    })
    setTimeout(() => win.webContents.send('scan:complete', PROBE_TREE), 80)
  })
  ipcMain.on('scan:cancel', () => { })

  const timeout = setTimeout(() => {
    console.error('  \u2717 probe timed out')
    app.exit(1)
  }, 40000)

  await win.loadFile(path.join(ROOT, 'out/renderer/index.html'))
  await pause(2500)

  // ------------------------------------------------------------ bridge
  const boot = await evaluate(
    win,
    `(() => {
      const api = window.diskAPI
      const root = document.getElementById('root')
      const sidebarText = [...document.querySelectorAll('aside')].map((n) => n.innerText).join(' ')
      return {
        apiType: typeof api,
        apiMethods: api ? Object.keys(api).sort() : [],
        platform: api ? api.platform() : null,
        rootHtmlLength: root ? root.innerHTML.length : 0,
        headings: [...document.querySelectorAll('h1, h2, h3')].map((n) => n.textContent),
        sidebarMentionsVolume: sidebarText.includes('Probe Volume'),
        sidebarText: sidebarText.replace(/\\s+/g, ' ').slice(0, 160)
      }
    })()`
  )

  console.log('\npreload bridge and first paint')
  check('window.diskAPI is exposed by the preload', boot.apiType === 'object', boot.apiType)
  check(
    'exactly the expected method names',
    JSON.stringify(boot.apiMethods) === JSON.stringify(EXPECTED_API),
    boot.apiMethods.join(', ')
  )
  check('platform() is reachable from the renderer', boot.platform === 'darwin', String(boot.platform))
  check('React mounted into #root', boot.rootHtmlLength > 500, `${boot.rootHtmlLength} chars`)
  check(
    'the empty state rendered',
    boot.headings.some((h) => /See where your disk space went/.test(h)),
    JSON.stringify(boot.headings)
  )
  check('the sidebar shows the volume returned over IPC', boot.sidebarMentionsVolume, boot.sidebarText)

  // -------------------------------------------------------------- scan
  console.log('\nscan lifecycle and charts')
  const clicked = await evaluate(
    win,
    `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Scan')
      if (!button) return false
      button.click()
      return true
    })()`
  )
  check('the sidebar Scan button exists and is clickable', clicked === true)

  const sunburstArcs = await waitFor(
    win,
    `document.querySelectorAll('path.chart-segment').length`
  )
  check('the sunburst rendered arcs', sunburstArcs > 0, String(sunburstArcs))

  const centre = await evaluate(
    win,
    `(() => {
      const name = document.querySelector('text.centre-name')
      const size = document.querySelector('text.centre-size')
      const labels = [...document.querySelectorAll('text.arc-label')].map((n) => n.textContent)
      return { name: name ? name.textContent : null, size: size ? size.textContent : null, labels }
    })()`
  )
  check('the centre disc names the scanned root', centre.name === 'Probe Volume', String(centre.name))
  check('the centre disc shows the total size', /GB/.test(centre.size || ''), String(centre.size))
  check(
    'arc labels include the largest folder',
    centre.labels.some((label) => /Movies/.test(label)),
    centre.labels.join(' | ')
  )
  check(
    'the disk bar renders category segments',
    (await evaluate(win, `document.querySelectorAll('main div[title*="—"]').length`)) > 0
  )

  // Drill down: clicking the Movies arc should re-root the partition.
  const drilled = await evaluate(
    win,
    `(() => {
      const paths = [...document.querySelectorAll('path.chart-segment')]
      // Arcs are ordered by size, so the first one belongs to the biggest child.
      const target = paths[0]
      if (!target) return false
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`
  )
  await pause(900)
  const afterDrill = await evaluate(
    win,
    `(() => {
      const name = document.querySelector('text.centre-name')
      const crumbs = [...document.querySelectorAll('nav button')].map((n) => n.textContent.trim())
      return { name: name ? name.textContent : null, crumbs, paths: document.querySelectorAll('path.chart-segment').length }
    })()`
  )
  check('drilling re-roots the chart', afterDrill.name === 'Movies', String(afterDrill.name))
  check(
    'the breadcrumb trail gained a level',
    afterDrill.crumbs.includes('Movies'),
    afterDrill.crumbs.join(' > ')
  )
  check(
    'the drilled view re-rendered arcs',
    drilled === true && afterDrill.paths > 0,
    String(afterDrill.paths)
  )

  // Back up one level.
  await evaluate(
    win,
    `(() => {
      const back = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Back')
      if (back) back.click()
    })()`
  )
  await pause(700)
  const afterBack = await evaluate(
    win,
    `(() => {
      const name = document.querySelector('text.centre-name')
      return name ? name.textContent : null
    })()`
  )
  check('the Back button zooms out', afterBack === 'Probe Volume', String(afterBack))

  // ------------------------------------------------------- other views
  async function switchView(title) {
    await evaluate(
      win,
      `(() => {
        const button = document.querySelector('button[title="' + ${JSON.stringify(title)} + '"]')
        if (button) button.click()
        return Boolean(button)
      })()`
    )
    await pause(900)
  }

  await switchView('Treemap')
  const treemapRects = await evaluate(win, `document.querySelectorAll('rect.chart-segment').length`)
  check('the treemap rendered rectangles', treemapRects > 0, String(treemapRects))
  const treemapLabels = await evaluate(
    win,
    `[...document.querySelectorAll('text.arc-label')].map((n) => n.textContent)`
  )
  check(
    'the treemap labelled its cells',
    treemapLabels.some((label) => /blockbuster/.test(label)),
    treemapLabels.join(' | ')
  )

  await switchView('List')
  const listState = await evaluate(
    win,
    `(() => ({
      rows: document.querySelectorAll('input[type="checkbox"]').length,
      hasHeaders: /Last Modified/.test(document.body.innerText),
      names: [...document.querySelectorAll('[title^="/"]')].map((n) => n.textContent).slice(0, 8)
    }))()`
  )
  check('the list view rendered rows', listState.rows > 0, String(listState.rows))
  check('the list view rendered its headers', listState.hasHeaders === true)
  check(
    'the list view lists the scanned entries',
    listState.names.some((name) => /Movies|Photos|archive|notes/.test(name)),
    listState.names.join(' | ')
  )

  // Sorting by a column header must not throw.
  await evaluate(
    win,
    `(() => {
      const header = [...document.querySelectorAll('button')].find((b) => /^Name/.test(b.textContent))
      if (header) header.click()
    })()`
  )
  await pause(400)
  const sorted = await evaluate(win, `document.querySelectorAll('input[type="checkbox"]').length`)
  check('sorting by name keeps the list rendered', sorted > 0, String(sorted))

  // Filtering to a single entry.
  await evaluate(
    win,
    `(() => {
      const input = document.getElementById('Bestdisk-filter-input')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Photos')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`
  )
  await pause(500)
  const filtered = await evaluate(
    win,
    `(() => ({
      rows: document.querySelectorAll('input[type="checkbox"]').length,
      names: [...document.querySelectorAll('[title^="/"]')].map((n) => n.textContent)
    }))()`
  )
  check('filtering narrows the list', filtered.rows === 1, String(filtered.rows))
  check(
    'filtering keeps the matching entry',
    filtered.names.some((name) => /Photos/.test(name)),
    filtered.names.join(' | ')
  )

  clearTimeout(timeout)

  check('no renderer console errors across the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

  console.log(failures === 0 ? '\nRenderer probe passed.\n' : `\n${failures} probe check(s) failed.\n`)
  app.exit(failures === 0 ? 0 : 1)
})
