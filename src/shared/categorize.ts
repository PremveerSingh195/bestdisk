import type { FileCategory } from './types'

/**
 * Extension → category mapping. Lives in `shared` because the main process
 * stamps `category` onto every scanned file and the renderer reuses the same
 * mapping for its own grouping/filtering.
 */
const CATEGORY_MAP: Record<string, FileCategory> = {}

function assign(category: FileCategory, extensions: string[]): void {
  for (const ext of extensions) CATEGORY_MAP[ext] = category
}

assign('Applications', [
  'app',
  'dmg',
  'pkg',
  'appimage',
  'exe',
  'msi',
  'apk',
  'ipa',
  'xip'
])

assign('Documents', [
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'markdown',
  'rtf',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'pages',
  'numbers',
  'key',
  'epub',
  'mobi',
  'odt',
  'ods',
  'odp',
  'tex'
])

assign('Images', [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'heic',
  'heif',
  'tiff',
  'tif',
  'bmp',
  'ico',
  'psd',
  'ai',
  'raw',
  'cr2',
  'nef',
  'arw',
  'dng',
  'avif'
])

assign('Videos', [
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'flv',
  'wmv',
  'm4v',
  'mpg',
  'mpeg',
  '3gp',
  'ts',
  'vob'
])

assign('Audio', [
  'mp3',
  'wav',
  'aac',
  'flac',
  'ogg',
  'oga',
  'm4a',
  'aiff',
  'aif',
  'wma',
  'opus',
  'mid'
])

assign('Archives', ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'iso', 'cab', 'lz4', 'zst'])

assign('Development', [
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'swift',
  'c',
  'cc',
  'cpp',
  'cxx',
  'h',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'sql',
  'json',
  'jsonc',
  'yml',
  'yaml',
  'toml',
  'ini',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'dart',
  'lua',
  'pl',
  'r',
  'scala',
  'clj',
  'ex',
  'exs',
  'erl',
  'hs',
  'gradle',
  'lock',
  'node',
  'wasm',
  'jar',
  'class',
  'o',
  'a',
  'pyc',
  'vue'
])

assign('System', [
  'plist',
  'dylib',
  'so',
  'dll',
  'framework',
  'kext',
  'log',
  'cache',
  'db',
  'sqlite',
  'sqlite3',
  'tmp',
  'temp',
  'swp',
  'swo',
  'bak',
  'old',
  'crash',
  'sparseimage',
  'bundle',
  'xpc',
  'pkg'
])

/** Extensions that are filesystem noise rather than user documents. */
const NOISE_NAMES = new Set(['.DS_Store', 'Thumbs.db', '.localized'])

export const FILE_CATEGORIES: FileCategory[] = [
  'Applications',
  'Documents',
  'Images',
  'Videos',
  'Audio',
  'Archives',
  'Development',
  'System',
  'Other'
]

/** Colour token per category, shared by the DiskBar, badges and the right panel. */
export const CATEGORY_COLORS: Record<FileCategory, string> = {
  Applications: '#bf5af2',
  Documents: '#0a84ff',
  Images: '#30d158',
  Videos: '#ff6b35',
  Audio: '#ffd60a',
  Archives: '#ff9f0a',
  Development: '#64d2ff',
  System: '#8e8e93',
  Other: '#636366'
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function categorize(name: string, isDirectory: boolean): FileCategory {
  if (isDirectory) {
    // Directories are not categorised individually; the UI rolls up the
    // categories of the files underneath them.
    if (NOISE_NAMES.has(name)) return 'System'
    if (name.endsWith('.app')) return 'Applications'
    return 'Other'
  }
  if (NOISE_NAMES.has(name)) return 'System'
  const ext = extensionOf(name)
  if (!ext) return 'Other'
  return CATEGORY_MAP[ext] ?? 'Other'
}
