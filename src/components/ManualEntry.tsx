import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'

export function ManualEntry({
  title,
  initial = '',
  confirmLabel = 'Save',
  onSubmit,
  onCancel,
}: {
  title: string
  initial?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  // serials are digits today; letters stay one tap away in case the format changes
  const [letters, setLetters] = useState(/[^\d]/.test(initial))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <Modal onClose={onCancel}>
      <form onSubmit={submit}>
        <h2 className="modal-title">{title}</h2>
        <div className="input-row">
          <input
            key={letters ? 'text' : 'num'}
            className="input input-big mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode={letters ? 'text' : 'numeric'}
            enterKeyHint="done"
          />
          <button type="button" className="btn kb-toggle" onClick={() => setLetters((v) => !v)}>
            {letters ? '123' : 'ABC'}
          </button>
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
