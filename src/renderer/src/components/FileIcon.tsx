import clsx from 'clsx'
import {
  Archive,
  Code,
  File,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image,
  Music,
  Package,
  Settings
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DiskNode } from '@shared/types'

/** Icon used for each category, plus the directory fallbacks. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Applications: Package,
  Documents: FileText,
  Images: Image,
  Videos: Film,
  Audio: Music,
  Archives: Archive,
  Development: Code,
  System: Settings,
  Other: File
}

const EXTENSION_ICONS: Record<string, LucideIcon> = {
  app: Package,
  zip: Archive,
  dmg: Package,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  svg: Image,
  heic: Image,
  mp4: Film,
  mov: Film,
  mkv: Film,
  mp3: Music,
  wav: Music,
  flac: Music,
  ts: Code,
  tsx: Code,
  js: Code,
  jsx: Code,
  py: Code,
  rs: Code,
  go: Code,
  md: FileText,
  txt: FileText,
  pdf: FileText
}

export function iconFor(node: DiskNode): LucideIcon {
  if (node.type === 'directory') {
    if (node.name.endsWith('.app')) return Package
    return node.children && node.children.length > 0 ? FolderOpen : Folder
  }

  const extension = node.extension ?? ''
  const byExtension = extension ? EXTENSION_ICONS[extension] : undefined
  if (byExtension) return byExtension

  return CATEGORY_ICONS[node.category ?? 'Other'] ?? File
}

export function FileIcon({
  node,
  className,
  color
}: {
  node: DiskNode
  className?: string
  color?: string
}): JSX.Element {
  const Icon = iconFor(node)
  return (
    <Icon
      className={clsx('shrink-0', className ?? 'h-4 w-4')}
      strokeWidth={1.75}
      style={color ? { color } : undefined}
    />
  )
}
