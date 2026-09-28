'use client'
import { Modal } from '@/components/ui/Modal'

const KEYS: [string, string][] = [
  ['Space', 'Hold until green, release to start · press to stop'],
  ['Any key', 'Stops a running solve'],
  ['Esc', 'Cancel inspection or an armed hold'],
  ['N', 'New scramble'],
  ['2', 'Toggle +2 on the last solve'],
  ['D', 'Toggle DNF on the last solve'],
  ['⌫', 'Delete the last solve (undo available)'],
  ['S', 'Open this scramble in Solve Lab'],
  ['?', 'Show this list'],
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
        {KEYS.map(([k, d]) => (
          <div key={k} className="contents">
            <dt><kbd>{k}</kbd></dt>
            <dd className="text-sm text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
