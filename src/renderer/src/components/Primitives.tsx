import clsx from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-blue)] text-white border border-transparent hover:brightness-110 active:brightness-95',
  secondary:
    'bg-[var(--bg-glass)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
  danger:
    'bg-[var(--accent-red)] text-white border border-transparent hover:brightness-110 active:brightness-95'
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-6 gap-1 rounded-md px-2 text-label',
  md: 'h-8 gap-1.5 rounded-lg px-3 text-body'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'mac-ease inline-flex shrink-0 items-center justify-center font-medium transition-all duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      ) : null}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
  size?: 'sm' | 'md'
}

export function IconButton({
  icon: Icon,
  label,
  active = false,
  size = 'md',
  className,
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'mac-ease inline-flex items-center justify-center rounded-md border border-transparent transition-all duration-150',
        size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        active
          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.75} />
    </button>
  )
}

export function Badge({
  children,
  color,
  className
}: {
  children: ReactNode
  color?: string
  className?: string
}): JSX.Element {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-1.5 py-[1px] text-label font-medium',
        className
      )}
      style={color ? { backgroundColor: `${color}22`, color, borderColor: `${color}44` } : undefined}
    >
      {children}
    </span>
  )
}

export function ProgressBar({
  value,
  max,
  color = 'var(--accent-blue)',
  className
}: {
  value: number
  max: number
  color?: string
  className?: string
}): JSX.Element {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={clsx('h-1 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]', className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="mac-ease h-full rounded-full transition-[width] duration-300"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  )
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

export function Checkbox({ label, className, ...rest }: CheckboxProps): JSX.Element {
  return (
    <label
      className={clsx(
        'inline-flex cursor-pointer select-none items-center gap-1.5 text-body',
        className
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-blue)]"
        {...rest}
      />
      {label ? <span className="text-[var(--text-secondary)]">{label}</span> : null}
    </label>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  title?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
}): JSX.Element {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-glass)] p-0.5',
        className
      )}
    >
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'mac-ease inline-flex items-center gap-1 rounded-md px-2 py-1 text-label font-medium transition-all duration-150',
              active
                ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Spinner({ className }: { className?: string }): JSX.Element {
  return <Loader2 className={clsx('h-4 w-4 animate-spin text-[var(--text-secondary)]', className)} />
}

export function PanelHeader({
  title,
  action
}: {
  title: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-label font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {title}
      </h3>
      {action}
    </div>
  )
}

/** Rounded, recessed container used for every panel in the sidebar/right rail. */
export function Card({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={clsx(
        'rounded-xl border border-[var(--border)] bg-[var(--bg-glass)] p-3',
        className
      )}
    >
      {children}
    </div>
  )
}
