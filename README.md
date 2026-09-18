# Bestdisk

A macOS disk space analyzer and manager built with Electron, React and D3.
Scan a volume or folder, explore it as a sunburst or treemap, then move the
offenders to the Trash without leaving the app.

## Requirements

- macOS 11+
- Node.js 20+ (developed on 22.15)
- No native modules, so no Xcode toolchain is needed

## Getting started

```bash
npm install
npm run dev          # electron-vite dev server + Electron with hot reload
npm run typecheck    # tsc over the node and web projects
npm run smoke        # scanner / df parser / duplicate finder smoke test
npm run probe        # headless renderer + chart render test (needs a build)
npm run build        # typecheck, then bundle main + preload + renderer
npm run build:mac    # package a DMG (x64 + arm64)
npm run build:mac:universal
```

### If `npm run dev` fails with "Electron uninstall"

Electron's postinstall step downloads a ~100 MB binary, and it can silently not
run during `npm install` (leaving `node_modules/electron/dist` and `path.txt`
missing). Fix it with:

```bash
node node_modules/electron/install.js
```

## Architecture

```
electron-vite bundles three targets:
  src/main     → out/main      (Node/Electron main process, CJS)
  src/preload  → out/preload   (contextBridge, CJS)
  src/renderer → out/renderer  (React + D3, ESM)

src/shared     → imported by all three; types and the extension→category map
```

### Main process

| Module | Responsibility |
|---|---|
| `index.ts` | Vibrancy window, lifecycle, single-instance lock |
| `ipc.ts` | All IPC handlers, scan lifecycle, broadcast to renderers |
| `menu.ts` | Trimmed app menu (see "Deviations") |
| `modules/scanner.ts` | Async recursive walk, throttled progress, symlink-cycle guard |
| `modules/diskInfo.ts` | `df -kP` parsing + `diskutil` enrichment + `fs.statfs` |
| `modules/fileOps.ts` | Trash, permanent delete, reveal, Get Info, Quick Look |
| `modules/duplicates.ts` | Three-pass duplicate finder |
| `modules/hashWorker.ts` | Worker-thread hashing entry (second main bundle) |
| `modules/permissions.ts` | Full Disk Access probe + System Settings deep link |

### Renderer

`src/renderer/src` holds the React app: `components/` (charts, panels, dialogs),
`stores/` (Zustand), `utils/` (formatting, colour scales, tree algebra) and
`hooks/`.

Scans stream progress over IPC every 200 ms and resolve with the full tree.
Directory sizes are rolled up in the main process, so the renderer receives a
tree it can immediately lay out.

### What the scanner refuses to walk

Five guarded trees, compared against **resolved** paths: `/dev`, `/proc`, `/sys`,
`/System/Volumes/VM` (swap, and always growing) and `/System/Volumes/Data`.

The Data volume is guarded because it is the tree the firmlinks (`/Users`,
`/Library`, `/Applications`, …) already expose — walking it as well would count
every user file twice. A volume the user picked by name is never skipped, so
scanning `/System/Volumes/Data` from the sidebar still works.

Resolution matters more than it sounds. `/Volumes/Macintosh HD` — the alias
macOS's open dialog offers for the boot disk — is a symlink to `/`, so a walk
there reaches the very same `/dev` through a different prefix. An earlier version
compared raw path prefixes, which meant that alias bypassed every guard and the
walk ended up inside devfs, where entries appear and disappear with the process's
file descriptors. That is what produced
`EBADF: bad file descriptor, lstat '/Volumes/Macintosh HD/dev/fd/12'`.

Two consequences of that fix are worth knowing:

- The scan root goes through `fs.stat`, not `fs.lstat`, so an aliased root is
  scanned rather than rejected.
- A single unreadable entry no longer fails the scan. Unexpected errors are
  counted and skipped (first 20 logged to the main-process console, plus a total
  at the end), because a disk this size always has a few and failing the whole
  walk leaves the user with nothing.

### Duplicate detection

1. Bucket every file by exact byte size — no hashing.
2. Hash the first 64 KB of size-matched candidates, in worker threads.
3. Fully hash only the survivors.

Worker threads keep the main process responsive; if the worker entry cannot be
loaded the finder falls back to hashing inline rather than failing.

## Tests

Neither suite needs a native toolchain, and both exit non-zero on failure.

### `npm run smoke` — main process

Bundles `scripts/smoke.ts` into `out/main/` (so `__dirname` resolves exactly as
in the packaged app, and so the worker path is exercised for real) and asserts
behaviour against throwaway fixtures:

- the scanner terminates on a symlink cycle, follows a directory symlink once,
  keeps dangling links, rolls up sizes and reports exact byte counts
- cancellation, missing roots and non-directory roots reject
- the guards fire on the real paths — including through the `/Volumes/Macintosh
  HD` alias — while a user folder that merely shares a guarded name (`~/dev`) and
  a real folder reached through a symlink are still scanned, so the guards
  neither under- nor over-reach
- the `df` parser handles mount points containing spaces and hides virtual
  APFS volumes
- the duplicate finder reports the right group and excludes same-size files
  with different content, empty files and unique sizes
-  the compiled `hashWorker.js` loads in a `Worker` and returns the same hash as
  the pipeline, so a broken worker cannot be masked by the inline fallback

### `npm run probe` — renderer and charts

`scripts/probe-renderer.cjs` loads the built renderer and the real preload into
an off-screen window, stubs the IPC it needs, then drives a full scan from the
UI. It verifies the preload exposes exactly the expected 18 methods, that React
mounts, and that a scan renders the sunburst (centre disc, arc labels), the
smart-disk bar, drill-down with breadcrumbs, zoom-out, the treemap and the
virtualised list including sort and filter — while asserting no renderer console
error occurs anywhere in the run.

This exists because a D3 layout only fails at runtime: typecheck and a bundle
build cannot tell you a chart renders.

## Deviations from the original spec

These are deliberate; each one is called out in the code where it applies.

**Toolchain versions.** The spec pinned Electron 30 + electron-vite 2, but
`electron-vite@2` caps at Vite 6 and that pairing is 2024-era. The project uses
Electron 44 + electron-vite 5 + Vite 7. React 18, Tailwind 3.4, D3 7, Recharts 2
and Zustand 4 are as specified.

**Project layout.** electron-vite's conventions (`src/main`, `src/preload`,
`src/renderer`, `src/shared`) are used instead of a top-level `electron/`
directory, because that is what the toolchain expects out of the box. The hash
worker is declared as a second main entry rather than living beside the renderer.

**APIs that do not exist in the spec.**
- `app.requestSingleInstanceFocus()` → `requestSingleInstanceLock()` plus a
  `second-instance` handler.
- `systemPreferences.getMediaAccessStatus('camera')` as a Full Disk Access
  check → `getMediaAccessStatus` only covers camera/microphone/screen. macOS
  ships no API for FDA, so `modules/permissions.ts` probes protected paths and
  reads the error code, then links to the correct System Settings pane.
- `com.apple.security.files.all` is not an entitlement. Full Disk Access is a
  TCC permission the user grants manually, which the entitlements file says.

**Menu.** A trimmed menu replaces Electron's default one, because the stock
View menu binds `⌘R` to Reload and would shadow the app's rescan shortcut.

**Title bar.** The spec's `trafficLightPosition: { x: 16, y: 18 }` places the
buttons at y 18–30, which a 28 px drag strip cuts through. The renderer draws a
38 px title strip and the buttons sit at y 13.

**Extra preload methods.** The spec asked for "exactly these methods", but four
more were needed for a usable app: `onScanError`, `onDuplicateProgress`,
`quickLook` (`qlmanage -p`, since Electron has no Quick Look API) and the
permission pair `checkPermissions` / `openFullDiskAccessSettings`.

**Third store.** `useUiStore` holds theme, hover and context-menu state. Mixing
transient UI state into the scan or selection stores made both harder to follow.

**File list interaction.** The spec said a row click reveals a file in Finder.
That makes selection impossible, so a single click selects (⌘-click toggles,
⇧-click extends a range) and a double click drills into a folder or reveals a
file. Rows are virtualised with `react-window`, always rather than only above
10 000 children, so there is a single code path.

**Vibrancy scope.** Electron applies `vibrancy` to the whole window; it cannot
be limited to the sidebar. The sidebar is translucent so the material shows
through and the main canvas paints an opaque background over it.

**No CSP meta tag.** A strict CSP breaks Vite's dev-time React refresh inline
script. A production CSP should be applied in the main process via
`session.defaultSession.webRequest.onHeadersReceived`.

**`⌘,` is not bound.** There is no preferences pane; theme and the size/age
colour mode live in the toolbar.

## Known limitations

- The whole tree is structured-cloned over IPC on completion. A full `/` scan is
  hundreds of thousands of nodes, so the final transfer is the slowest step.
- Zero-byte files stay in the tree. Charts merge everything below 0.1 % of its
  parent into an "Other" bucket (and cap rendering at 2 000 nodes), but the list
  view shows them all.
- Symlinked directories are followed once, so bytes reachable through two paths
  are counted twice. This matches Finder's notion of size but not `du`'s
  default.
- Entries the scanner could not read are dropped from the totals and reported
  only on the main-process console; the renderer gets no "N items skipped"
  count, so a size can be slightly short with no visible explanation.
- Scans cannot be paused or resumed, and scan results are not persisted between
  launches.
