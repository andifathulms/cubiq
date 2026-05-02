import type { Session } from '@/types'

export function exportToJSON(sessions: Session[]): void {
  const data = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    sessions,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cubiq-export-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importFromJSON(json: string): Session[] {
  const data = JSON.parse(json)
  if (data.version !== '1.0') throw new Error('Unsupported export version')
  if (!Array.isArray(data.sessions)) throw new Error('Invalid format')
  return data.sessions as Session[]
}
