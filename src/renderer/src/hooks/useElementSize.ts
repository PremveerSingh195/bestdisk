import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/** Tracks an element's content box so charts can re-layout on resize. */
export function useElementSize<T extends HTMLElement>(): [RefObject<T>, ElementSize] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  const rafId = useRef(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined

    const observer = new ResizeObserver((entries) => {
      // Cancel any pending frame to coalesce rapid resize events into one update.
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(() => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        setSize((current) =>
          Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
            ? current
            : { width, height }
        )
      })
    })

    observer.observe(element)
    setSize({ width: element.clientWidth, height: element.clientHeight })

    return () => {
      cancelAnimationFrame(rafId.current)
      observer.disconnect()
    }
  }, [])

  return [ref, size]
}
