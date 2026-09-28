'use client'
import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { Segmented } from '@/components/ui/Toggle'

/** Export / import of all sessions (JSON). Import asks merge vs replace
 *  up front instead of a confirm() dialog. */
export function DataTransfer({ compact }: { compact?: boolean }) {
  const { exportData, importData } = useCubiqStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.text().then(json => {
      try {
        importData(json, mode)
        setStatus({ ok: true, text: mode === 'replace' ? 'Imported — your sessions were replaced.' : 'Imported — sessions added.' })
      } catch (err) {
        setStatus({ ok: false, text: `That file couldn't be imported: ${err instanceof Error ? err.message : String(err)}` })
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'justify-between'}`}>
        <button className="btn btn-ghost btn-sm" onClick={exportData}><Download size={14} /> Export JSON</button>
        <div className="flex items-center gap-2">
          {!compact && <Segmented label="Import mode" value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Add' }, { value: 'replace', label: 'Replace' }]} />}
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
      </div>
      {status && <p className={`text-xs ${status.ok ? 'text-go' : 'text-stop'}`}>{status.text}</p>}
    </div>
  )
}
