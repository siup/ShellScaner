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
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <Modal onClose={onCancel}>
      <form onSubmit={submit}>
        <h2 className="modal-title">{title}</h2>
        <input
          className="input input-big"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
        />
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
