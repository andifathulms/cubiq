'use client'
import { useState } from 'react'
import Link from 'next/link'
import { FlaskConical, ChevronRight } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { Toggle, Segmented } from '@/components/ui/Toggle'
import { DataTransfer } from '@/components/session/DataTransfer'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 py-4 border-t border-line first:border-t-0 first:pt-0">
      <h3 className="label">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

export function SettingsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { settings, updateSettings } = useCubiqStore()
  const [urlInput, setUrlInput] = useState(settings.ml_service_url)

  return (
    <div className="flex flex-col">
      <Section title="Appearance">
        <Row label="Theme" hint="System follows your device setting">
          <Segmented
            label="Theme" value={settings.theme}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            onChange={v => updateSettings({ theme: v })}
          />
        </Row>
        <Row label="Scramble size">
          <Segmented
            label="Scramble size" value={settings.scramble_size}
            options={[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]}
            onChange={v => updateSettings({ scramble_size: v })}
          />
        </Row>
      </Section>

      <Section title="Timer">
        <Toggle
          id="set-inspection" label="WCA inspection" hint="Countdown before the solve; over time adds +2, then DNF"
          checked={settings.inspection_enabled} onChange={v => updateSettings({ inspection_enabled: v })}
        />
        {settings.inspection_enabled && (
          <Row label="Inspection length">
            <Segmented
              label="Inspection length" value={settings.inspection_duration}
              options={[{ value: 8, label: '8 s' }, { value: 12, label: '12 s' }, { value: 15, label: '15 s' }]}
              onChange={v => updateSettings({ inspection_duration: v })}
            />
          </Row>
        )}
        <Row label="Precision">
          <Segmented
            label="Precision" value={settings.timer_precision}
            options={[{ value: 'centiseconds', label: '0.01' }, { value: 'milliseconds', label: '0.001' }]}
            onChange={v => updateSettings({ timer_precision: v })}
          />
        </Row>
        <Toggle
          id="set-voice" label="Voice alerts" hint="Calls “8 seconds” and “12 seconds” during inspection"
          checked={settings.voice_alerts} onChange={v => updateSettings({ voice_alerts: v })}
        />
      </Section>

      <Section title="Practice">
        <Row label="Cube preview" hint="Shown beside the timer">
          <Segmented
            label="Cube preview" value={settings.cube_dock}
            options={[{ value: 'net', label: 'Net' }, { value: '3d', label: '3D' }, { value: 'hidden', label: 'Off' }]}
            onChange={v => updateSettings({ cube_dock: v })}
          />
        </Row>
      </Section>

      <Section title="Your data">
        <DataTransfer />
      </Section>

      <Section title="Labs">
        <Link
          href="/research" onClick={onNavigate}
          className="flex items-center gap-3 p-3 rounded-xl border border-line hover:border-line-strong hover:bg-raised transition-colors"
        >
          <FlaskConical size={18} className="text-focus shrink-0" />
          <span className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-ink">Research: MDP solver</span>
            <span className="text-xs text-muted">Experimental RL training dashboard. Needs the Python cubiq-ml service running locally.</span>
          </span>
          <ChevronRight size={16} className="text-muted shrink-0" />
        </Link>
        <label className="flex flex-col gap-1.5" htmlFor="set-ml-url">
          <span className="text-sm text-ink">cubiq-ml URL</span>
          <input
            id="set-ml-url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onBlur={() => updateSettings({ ml_service_url: urlInput.trim() })}
            onKeyDown={e => { if (e.key === 'Enter') updateSettings({ ml_service_url: urlInput.trim() }) }}
            placeholder="http://localhost:8000"
            className="num text-xs px-3 py-2 rounded-lg outline-none bg-raised border border-line text-ink focus:border-line-strong"
          />
        </label>
      </Section>
    </div>
  )
}
