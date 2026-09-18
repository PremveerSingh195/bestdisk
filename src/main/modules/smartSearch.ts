import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SearchOptions, SmartSearchResult } from '@shared/types'

const KIND_PREDICATES: Record<string, string> = {
  apps: 'kMDItemContentTypeTree == "com.apple.application-bundle"',
  docs: '(kMDItemContentTypeTree == "public.text" || kMDItemContentTypeTree == "com.adobe.pdf" || kMDItemContentTypeTree == "public.presentation" || kMDItemContentTypeTree == "public.spreadsheet")',
  media: '(kMDItemContentTypeTree == "public.movie" || kMDItemContentTypeTree == "public.audio" || kMDItemContentTypeTree == "public.image")',
  archives: '(kMDItemContentTypeTree == "public.archive" || kMDItemContentTypeTree == "com.pkware.zip-archive")',
  code: '(kMDItemContentTypeTree == "public.source-code" || kMDItemContentTypeTree == "public.script")'
}

/** Executes mdfind on macOS to instantly query Spotlight's filesystem index */
export async function executeSmartSearch(options: SearchOptions): Promise<SmartSearchResult[]> {
  const { query = '', scope = 'all', kind = 'all', minSize = 0, limit = 200 } = options
  const home = os.homedir()

  const predicates: string[] = []

  const cleanQuery = query.trim().replace(/["\\]/g, '')
  if (cleanQuery) {
    predicates.push(`kMDItemFSName == "*${cleanQuery}*"c`)
  }

  if (kind !== 'all' && KIND_PREDICATES[kind]) {
    predicates.push(KIND_PREDICATES[kind])
  }

  if (minSize > 0) {
    predicates.push(`kMDItemFSSize >= ${Math.round(minSize)}`)
  }

  const args: string[] = []

  if (scope === 'home') {
    args.push('-onlyin', home)
  }

  if (predicates.length > 0) {
    args.push(predicates.join(' && '))
  } else if (cleanQuery) {
    args.push(cleanQuery)
  } else {
    // If no filter or query is given, search for large files by default
    args.push('kMDItemFSSize >= 52428800') // > 50MB
  }

  const rawOutput = await new Promise<string>((resolve) => {
    execFile('/usr/bin/mdfind', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve('')
        return
      }
      resolve(stdout)
    })
  })

  const lines = rawOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, limit)

  const results: SmartSearchResult[] = []

  for (const filePath of lines) {
    try {
      const stats = await fs.lstat(filePath)
      const baseName = path.basename(filePath)
      const ext = path.extname(filePath).toLowerCase().replace(/^\./, '')
      results.push({
        path: filePath,
        name: baseName,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        kind: stats.isDirectory() ? 'folder' : ext || 'file',
        extension: ext
      })
    } catch {
      // Ignore files that disappeared or cannot be read
    }
  }

  // Sort largest first
  return results.sort((a, b) => b.size - a.size)
}
