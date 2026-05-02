// All direct localStorage access goes through here.
// In practice the Zustand persist middleware owns the store key;
// these helpers are for auxiliary keys (scramble history, etc.).

export const SCRAMBLE_HISTORY_KEY = 'cubiq:scramble_history'

export function getScrambleHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SCRAMBLE_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function pushScrambleHistory(scramble: string): void {
  if (typeof window === 'undefined') return
  const history = getScrambleHistory()
  const updated = [scramble, ...history].slice(0, 10)
  localStorage.setItem(SCRAMBLE_HISTORY_KEY, JSON.stringify(updated))
}
