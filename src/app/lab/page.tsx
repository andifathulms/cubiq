'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Play, Shuffle, Timer } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/layout/AppShell'
import { PuzzleGlyph } from '@/components/ui/PuzzleGlyph'
import { Segmented, Toggle } from '@/components/ui/Toggle'
import { ScrambleChips } from '@/components/practice/ScrambleChips'
import { ScramblePreview } from '@/components/practice/ScramblePreview'
import { StagedResult, CopyButton } from '@/components/lab/StagedResult'
import { localSolve } from '@/lib/solvers/client'
import { generateScramble } from '@/lib/cubing'
import { LAB, LAB_BY_ID, normalise, type LabResult } from '@/lib/lab'
import { useCubiqStore } from '@/store'

const CrossSolver = dynamic(() => import('@/components/solvers/CrossSolver').then(m => m.CrossSolver), {
  ssr: false,
  loading: () => <div className="flex flex-col gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-raised animate-pulse" />)}</div>,
})

const FACES = ['best', 'D', 'U', 'F', 'B', 'R', 'L'] as const

export default function SolveLabPage() {
  const [puzzle, setPuzzle] = useState('333')
  const [methodId, setMethodId] = useState('cfop')
  const [scrambles, setScrambles] = useState<Record<string, string>>({})
  const [face, setFace] = useState<(typeof FACES)[number]>('best')
  const [doubleX, setDoubleX] = useState(false)
  const [preview, setPreview] = useState<'net' | '3d'>('3d')
  const [solving, setSolving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<LabResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoSolve = useRef(false)   // deep link: solve once the scramble is in place
  const request = useRef(0)

  const lab = LAB_BY_ID[puzzle]
  const method = lab.methods.find(m => m.id === methodId) ?? lab.methods[0]
  const scramble = scrambles[puzzle] ?? ''
  const practiceScramble = useCubiqStore(s => s.currentScramble)
  const practicePuzzle = useCubiqStore(s => s.sessions.find(x => x.id === s.activeSessionId)?.puzzle)

  const setScramble = useCallback((s: string) => setScrambles(prev => ({ ...prev, [puzzle]: s })), [puzzle])

  // Deep link: /lab?puzzle=444&scramble=… (from Practice or the solve log) solves right away.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const p = q.get('puzzle')
    const valid = p && LAB_BY_ID[p] ? p : null
    if (valid) { setPuzzle(valid); setMethodId(LAB_BY_ID[valid].methods[0].id) }
    const s = q.get('scramble')
    if (s) { setScrambles(prev => ({ ...prev, [valid ?? '333']: s })); autoSolve.current = true }
  }, [])

  // Every puzzle starts with a scramble on screen
  // (checked inside the updater, so a scramble from the URL set in the same
  // render is never overwritten)
  useEffect(() => {
    if (!scramble) setScrambles(prev => (prev[puzzle] ? prev : { ...prev, [puzzle]: generateScramble(puzzle) }))
  }, [puzzle, scramble])

  // Anything that changes the question clears the old answer
  useEffect(() => { request.current++; setResult(null); setError(null); setSolving(false); setProgress(null) }, [puzzle, methodId, scramble, face, doubleX])
  /* eslint-enable react-hooks/set-state-in-effect */

  const solve = useCallback(async () => {
    if (!scramble || method.id === 'cross') return
    const id = ++request.current
    setSolving(true); setResult(null); setError(null); setProgress(null)
    const body: Record<string, unknown> = { state: scramble, ...(method.body ?? {}) }
    if (method.id === 'cfop') { body.face = face; body.try_double_xcross = doubleX }
    try {
      const raw = await localSolve(method.endpoint, body, msg => { if (request.current === id) setProgress(msg) })
      if (request.current === id) setResult(normalise(puzzle, method, raw))
    } catch (e) {
      if (request.current === id) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (request.current === id) { setSolving(false); setProgress(null) }
    }
  }, [scramble, method, face, doubleX, puzzle])

  useEffect(() => {
    if (autoSolve.current && scramble) {
      autoSolve.current = false
      solve()
    }
  }, [scramble, solve])

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <PageHeader eyebrow="Solve Lab" title="How should this scramble be solved?" />

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Puzzle">
          {LAB.map(p => (
            <button
              key={p.id} type="button" aria-pressed={p.id === puzzle}
              onClick={() => { setPuzzle(p.id); setMethodId(p.methods[0].id) }}
              className={`flex items-center gap-2 h-9 pl-2 pr-3 rounded-[10px] border text-[13px] font-medium transition-colors ${
                p.id === puzzle ? 'border-go text-ink bg-[color-mix(in_srgb,var(--go)_10%,transparent)]' : 'border-line text-muted hover:text-ink hover:border-line-strong'
              }`}
            >
              <span className="grid place-items-center w-6 h-6 rounded-md bg-raised"><PuzzleGlyph puzzle={p.id} size={13} /></span>
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 items-start lg:grid-cols-[minmax(300px,370px)_1fr]">
          {/* Scramble */}
          <section className="card p-4 flex flex-col gap-4 lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <span className="label">Scramble</span>
              <CopyButton text={scramble} />
            </div>
            <ScrambleChips scramble={scramble} puzzle={puzzle} size="sm" align="start" />
            <textarea
              value={scramble} onChange={e => setScramble(e.target.value)} spellCheck={false} rows={2}
              aria-label="Edit scramble"
              className="num text-xs px-3 py-2.5 rounded-xl bg-raised border border-line text-ink-2 outline-none focus:border-line-strong resize-none"
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost btn-sm flex-1" onClick={() => setScramble(generateScramble(puzzle))}>
                <Shuffle size={14} /> New scramble
              </button>
              {practicePuzzle === puzzle && practiceScramble && practiceScramble !== scramble && (
                <button className="btn btn-ghost btn-sm flex-1" onClick={() => setScramble(practiceScramble)}>
                  <Timer size={14} /> Use Practice scramble
                </button>
              )}
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl bg-sunk/60 py-3">
              <Segmented label="Preview" value={preview} onChange={setPreview} options={[{ value: '3d', label: '3D' }, { value: 'net', label: 'Net' }]} />
              <ScramblePreview scramble={scramble} puzzle={puzzle} mode={preview} size={220} />
            </div>
          </section>

          {/* Method + result */}
          <section className="card p-4 md:p-5 flex flex-col gap-5 min-w-0">
            {lab.methods.length > 1 && (
              <div className="seg self-start" role="group" aria-label="Method">
                {lab.methods.map(m => (
                  <button key={m.id} type="button" aria-pressed={m.id === method.id} onClick={() => setMethodId(m.id)}>{m.label}</button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-lg font-bold tracking-tight">{lab.label} · {method.label}</h2>
              <p className="text-sm text-ink-2 max-w-[62ch]">{method.description}</p>
            </div>

            {method.id === 'cross' ? (
              <CrossSolver scramble={scramble} />
            ) : (
              <>
                {method.id === 'cfop' && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">Cross</span>
                      <Segmented label="Cross face" value={face} onChange={setFace} options={FACES.map(f => ({ value: f, label: f === 'best' ? 'Best' : f }))} />
                    </div>
                    <div className="min-w-[220px]">
                      <Toggle id="lab-doublex" label="Try double x-cross" checked={doubleX} onChange={setDoubleX} />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn btn-primary" onClick={solve} disabled={solving || !scramble}>
                    {solving ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    {solving ? 'Solving…' : 'Solve'}
                  </button>
                  {solving && <span className="text-sm text-muted animate-fade-in" role="status">{progress ?? 'Working…'}</span>}
                </div>
                {error && <p className="text-sm px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--stop)_12%,transparent)] text-stop">{error}</p>}
                {solving && !result && (
                  <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-raised animate-pulse" />)}</div>
                )}
                {result && <StagedResult puzzle={puzzle} twisty={lab.twisty} scramble={scramble} result={result} />}
                {!result && !solving && !error && (
                  <p className="text-sm text-muted">Press Solve to see the solution stage by stage, then play it on the cube.</p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
