'use client'
import { useEffect } from 'react'
import { useCubiqStore } from '@/store'

/** Mirrors the theme setting onto <html data-theme>; 'system' removes it so
 *  the OS preference (prefers-color-scheme) decides. */
export function ThemeSync() {
  const theme = useCubiqStore(s => s.settings.theme)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
    else delete root.dataset.theme
  }, [theme])
  return null
}
