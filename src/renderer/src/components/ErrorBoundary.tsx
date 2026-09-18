import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Primitives'

interface Props {
  /** Shown in the fallback, e.g. "Sunburst chart". */
  label: string
  children: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
}

/**
 * Wraps chart components. A D3 layout blowing up on a malformed tree should
 * cost the user one panel, not the whole window.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[DiskLens] ${this.props.label} crashed`, error, info.componentStack)
  }

  private readonly reset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--accent-orange)]" strokeWidth={1.5} />
        <div className="space-y-1">
          <p className="text-title font-semibold">The {this.props.label} could not be rendered</p>
          <p className="max-w-md text-body text-[var(--text-secondary)]">{error.message}</p>
        </div>
        <Button variant="secondary" onClick={this.reset}>
          Try again
        </Button>
      </div>
    )
  }
}
