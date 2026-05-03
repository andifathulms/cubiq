'use client'
import { useState, useRef } from 'react'
import { Upload, Download } from 'lucide-react'
import { useCubiqStore } from '@/store'

export function SettingsPanel() {
  const { settings, updateSettings, exportData, importData } = useCubiqStore()
  const [urlInput, setUrlInput] = useState(settings.ml_service_url)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const json = ev.target?.result as string
      const replace = window.confirm('Replace all existing data?\n\nOK = Replace  |  Cancel = Merge')
      try {
        importData(json, replace ? 'replace' : 'merge')
      } catch (err) {
        window.alert('Import failed: ' + String(err))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

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

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Voice alert on stop</span>
        <input
          type="checkbox"
          checked={settings.voice_alerts}
          onChange={e => updateSettings({ voice_alerts: e.target.checked })}
          className="w-4 h-4"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>ML service URL</span>
        <input
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={() => updateSettings({ ml_service_url: urlInput.trim() })}
          onKeyDown={e => { if (e.key === 'Enter') updateSettings({ ml_service_url: urlInput.trim() }) }}
          placeholder="http://localhost:8000"
          className="text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div className="border-t pt-4 flex gap-2" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={exportData}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Download size={12} />
          Export
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Upload size={12} />
          Import
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
    </div>
  )
}
