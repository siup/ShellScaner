import { useState } from 'react'
import type { DuplicateHit } from '../lib/types'
import { Modal } from './Modal'

/** Two-step: first the warning, then an explicit "really save a duplicate?" step. */
export function DuplicateWarning({
  hits,
  onRetry,
  onOverride,
}: {
  hits: DuplicateHit[]
  onRetry: () => void
  onOverride: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const kind = hits[0].kind === 'prefab' ? 'Prefab Serial' : 'Shell Serial'
  return (
    <Modal>
      <h2 className="modal-title warn">⚠ Duplicate</h2>
      <div className="modal-body">
        <p>This {kind} has already been scanned.</p>
        <p className="mono big">{hits[0].value}</p>
        {hits.map((h) => (
          <p key={h.shellId} className="dup-where">
            <b>{h.setName}</b>
            <br />
            Shell {h.position}
          </p>
        ))}
        {confirming && <p className="warn">Save it again anyway? This creates a duplicate entry.</p>}
      </div>
      <div className="modal-actions">
        {confirming ? (
          <button type="button" className="btn btn-danger" onClick={onOverride}>
            Yes, save duplicate
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Scan again
          </button>
        )}
        {confirming ? (
          <button type="button" className="btn" onClick={onRetry}>
            No, scan again
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
            Save anyway…
          </button>
        )}
      </div>
    </Modal>
  )
}
