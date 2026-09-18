import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Primitives'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

/**
 * Promise-based confirmation dialogs.
 *
 * `await confirm({...})` keeps destructive handlers linear instead of spreading
 * "is the dialog open?" state through every component that can delete a file.
 */
export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    []
  )

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value)
      setPending(null)
    },
    [pending]
  )

  useEffect(() => {
    if (!pending) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        settle(false)
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        settle(true)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [pending, settle])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {pending ? (
        <div
          className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/40 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) settle(false)
          }}
        >
          <div className="w-[380px] animate-scale-in rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl backdrop-blur-2xl">
            <div className="mb-3 flex items-start gap-3">
              {pending.options.destructive ? (
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-red)]"
                  strokeWidth={1.75}
                />
              ) : null}
              <div className="space-y-1">
                <h2 className="text-title font-semibold">{pending.options.title}</h2>
                <p className="text-body text-[var(--text-secondary)]">{pending.options.message}</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                autoFocus
                variant={pending.options.destructive ? 'danger' : 'primary'}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel ?? 'Continue'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return context
}
