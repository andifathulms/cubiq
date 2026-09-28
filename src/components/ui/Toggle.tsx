'use client'

interface Props {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}

/** Labelled on/off switch. */
export function Toggle({ id, checked, onChange, label, hint }: Props) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="block w-10 h-6 rounded-full bg-line-strong peer-checked:bg-go transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-2" />
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}

/** Segmented control bound to a value. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
