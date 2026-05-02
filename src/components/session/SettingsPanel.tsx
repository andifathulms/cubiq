'use client'
import { useCubiqStore } from '@/store'

export function SettingsPanel() {
  const { settings, updateSettings } = useCubiqStore()

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Inspection timer</span>
        <input
          type="checkbox"
          checked={settings.inspection_enabled}
          onChange={e => updateSettings({ inspection_enabled: e.target.checked })}
          className="w-4 h-4"
        />
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Inspection duration</span>
        <select
          value={settings.inspection_duration}
          onChange={e => updateSettings({ inspection_duration: Number(e.target.value) as 8 | 12 | 15 })}
          className="rounded-lg px-2 py-1 text-sm"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          <option value={8}>8 seconds</option>
          <option value={12}>12 seconds</option>
          <option value={15}>15 seconds</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Timer precision</span>
        <select
          value={settings.timer_precision}
          onChange={e => updateSettings({ timer_precision: e.target.value as 'centiseconds' | 'milliseconds' })}
          className="rounded-lg px-2 py-1 text-sm"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          <option value="centiseconds">Centiseconds (9.82)</option>
          <option value="milliseconds">Milliseconds (9.824)</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>3D cube preview</span>
        <input
          type="checkbox"
          checked={settings.cube_preview_visible}
          onChange={e => updateSettings({ cube_preview_visible: e.target.checked })}
          className="w-4 h-4"
        />
      </label>
    </div>
  )
}
