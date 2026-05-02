import { type ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function GlassCard({ children, className = '', onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={`glass rounded-2xl p-4 ${onClick ? 'cursor-pointer hover:border-[var(--border-hover)] transition-colors' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
