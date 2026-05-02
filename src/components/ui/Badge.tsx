interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'accent'
  className?: string
}

const variantStyles: Record<string, string> = {
  default: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
  success: 'bg-[var(--accent-success)]/10 text-[var(--accent-success)]',
  danger: 'bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]',
  warning: 'bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]',
  accent: 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
