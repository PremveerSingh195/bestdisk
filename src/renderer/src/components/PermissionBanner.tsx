import { useState } from 'react'
import { Shield, X } from 'lucide-react'
import { useScanStore } from '@renderer/stores/useScanStore'
import { Button } from './Primitives'

/**
 * macOS blocks reads of protected locations until the user grants Full Disk
 * Access in System Settings. There is no API to prompt for it, so the app
 * detects the missing permission and links to the right pane.
 */
export function PermissionBanner(): JSX.Element | null {
  const permissions = useScanStore((state) => state.permissions)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || permissions?.fullDiskAccess !== false) return null

  return (
    <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/10 p-3">
      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-orange)]" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-body font-medium">Grant Full Disk Access for a complete scan</p>
        <p className="text-label text-[var(--text-secondary)]">
          macOS is hiding some folders
          {permissions.probedPath ? ` (starting with ${permissions.probedPath})` : ''}. DiskLens will
          still scan what it can reach.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void window.diskAPI.openFullDiskAccessSettings()}
        >
          Open Settings
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
