import type { ReactNode } from 'react'

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export interface ConfirmProps {
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Confirm({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal onClose={onCancel}>
      <h2 className="modal-title">{title}</h2>
      {body && <div className="modal-body">{body}</div>}
      <div className="modal-actions">
        <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  )
}
