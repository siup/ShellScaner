import { useState, type FormEvent } from 'react'
import { TopBar } from '../components/TopBar'
import { createSet } from '../lib/sets'
import type { ScreenProps } from './types'

export function NewSetScreen({ store, nav }: ScreenProps) {
  const [name, setName] = useState('')
  const [expected, setExpected] = useState('')
  const [busy, setBusy] = useState(false)
  const nameTaken = store.sets.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    const n = parseInt(expected, 10)
    const set = createSet(name, Number.isFinite(n) && n > 0 ? n : undefined)
    await store.save(set)
    // set view sits under the scanner, so "back" from scanning lands on the list
    nav.replace({ name: 'set', id: set.id })
    nav.push({ name: 'scan', id: set.id })
  }

  return (
    <div className="screen">
      <TopBar title="New Set" onBack={nav.back} />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Set name / number</span>
          <input
            className="input input-big"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SET-001"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="next"
          />
          {nameTaken && <small className="warn">A set with this name already exists</small>}
        </label>
        <label className="field">
          <span>Expected shells (optional)</span>
          <input
            className="input input-big"
            value={expected}
            onChange={(e) => setExpected(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 8"
            enterKeyHint="go"
          />
        </label>
        <div className="bottom-actions">
          <button type="submit" className="btn btn-primary btn-xl" disabled={!name.trim() || busy}>
            Start scanning
          </button>
        </div>
      </form>
    </div>
  )
}
