import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { parentPort } from 'node:worker_threads'

/**
 * Worker thread entry point for duplicate detection.
 *
 * It is compiled as its own main-process bundle (`out/main/hashWorker.js`) and
 * loaded by `duplicates.ts` via `new Worker(path.join(__dirname, 'hashWorker.js'))`.
 * Results are posted per file rather than per batch so the caller can drive a
 * progress bar during long passes.
 */

export interface HashRequest {
  /** Batch id, echoed back on every response. */
  id: number
  files: string[]
  /** Hash only the first N bytes. Omit to hash the whole file. */
  bytes?: number
}

export type HashResponse =
  | { id: number; file: string; hash: string | null }
  | { id: number; done: true }

parentPort?.on('message', (request: HashRequest) => {
  void hashBatch(request)
})

async function hashBatch(request: HashRequest): Promise<void> {
  for (const file of request.files) {
    const hash = await hashFile(file, request.bytes)
    parentPort?.postMessage({ id: request.id, file, hash } satisfies HashResponse)
  }
  parentPort?.postMessage({ id: request.id, done: true } satisfies HashResponse)
}

/** Resolves `null` for unreadable files rather than failing the whole pass. */
function hashFile(file: string, bytes?: number): Promise<string | null> {
  return new Promise((resolve) => {
    const hash = createHash('sha1')
    const stream = createReadStream(
      file,
      bytes === undefined ? undefined : { start: 0, end: bytes - 1 }
    )

    stream.on('data', (chunk) => {
      hash.update(chunk)
    })
    stream.on('error', () => resolve(null))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
