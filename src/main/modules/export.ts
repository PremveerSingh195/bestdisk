import { writeFile } from 'node:fs/promises'
import { dialog } from 'electron'
import type { DiskNode } from '@shared/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function escapeCsvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function treeToCsv(root: DiskNode): string {
  const headers = ['Path', 'Name', 'Type', 'Size (Bytes)', 'Size (Formatted)', 'Item Count', 'Modified Time', 'Extension']
  const rows: string[] = [headers.join(',')]

  function walk(node: DiskNode): void {
    const itemCount = node.type === 'directory' ? (node.children?.length ?? 0) : ''
    const modTime = node.modifiedAt ? new Date(node.modifiedAt).toISOString() : ''
    const ext = node.extension ?? ''

    rows.push([
      escapeCsvCell(node.path),
      escapeCsvCell(node.name),
      escapeCsvCell(node.type),
      escapeCsvCell(node.size),
      escapeCsvCell(formatBytes(node.size)),
      escapeCsvCell(itemCount),
      escapeCsvCell(modTime),
      escapeCsvCell(ext)
    ].join(','))

    if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(root)
  return rows.join('\n')
}

export async function exportScanResults(
  format: 'csv' | 'json',
  root: DiskNode
): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }> {
  try {
    const dateStr = new Date().toISOString().slice(0, 10)
    const sanitizedName = (root.name || 'scan').replace(/[/\\?%*:|"<>]/g, '-')
    const defaultName = `Bestdisk-${sanitizedName}-${dateStr}.${format}`

    const result = await dialog.showSaveDialog({
      title: `Export Scan Results as ${format.toUpperCase()}`,
      defaultPath: defaultName,
      buttonLabel: 'Export',
      filters: [
        format === 'csv'
          ? { name: 'CSV File', extensions: ['csv'] }
          : { name: 'JSON File', extensions: ['json'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    const content =
      format === 'csv' ? treeToCsv(root) : JSON.stringify(root, null, 2)

    await writeFile(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
