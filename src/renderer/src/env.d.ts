import type { DiskAPI } from '@shared/types'

declare global {
  interface Window {
    /** Exposed by `src/preload/index.ts` via contextBridge. */
    diskAPI: DiskAPI
  }
}

export {}
