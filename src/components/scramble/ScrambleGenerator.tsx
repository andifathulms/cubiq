'use client'
import { useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { generateScramble } from '@/lib/cubing'
import { pushScrambleHistory } from '@/lib/storage'

export function ScrambleGenerator() {
  const { currentScramble, setCurrentScramble, timerState } = useCubiqStore()

  const fetchScramble = useCallback(async () => {
    const scramble = await generateScramble('333')
    setCurrentScramble(scramble)
    pushScrambleHistory(scramble)
  }, [setCurrentScramble])

  useEffect(() => {
    if (!currentScramble) fetchScramble()
  }, [currentScramble, fetchScramble])

  // Auto-generate after solve completes
  useEffect(() => {
    if (timerState === 'stopped') {
      fetchScramble()
    }
  }, [timerState, fetchScramble])

  return (
    <button
      onClick={fetchScramble}
      title="New scramble"
      className="p-2 rounded-xl transition-colors"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-primary)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
    >
      <RefreshCw size={18} />
    </button>
  )
}
