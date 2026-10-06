import { useState } from 'react'
import { CompleteSetDialog } from '../components/CompleteSetDialog'
import { DuplicateWarning } from '../components/DuplicateWarning'
import { ManualEntry } from '../components/ManualEntry'
import { Confirm, Modal } from '../components/Modal'
import { TopBar } from '../components/TopBar'
import { setsToCsv, safeFileName } from '../lib/csv'
import { completeSet, findDuplicates, removeShell, updateShellSerial } from '../lib/sets'
import { shareOrDownload } from '../lib/share'
import type { DuplicateHit, SerialKind, ShellItem, ShellSet } from '../lib/types'
import type { ScreenProps } from './types'

type Dialog =
  | { type: 'shell'; shell: ShellItem }
  | { type: 'edit'; shell: ShellItem; kind: SerialKind }
  | { type: 'dup'; shell: ShellItem; kind: SerialKind; value: string; hits: DuplicateHit[] }
  | { type: 'delete'; shell: ShellItem }
  | { type: 'complete' }
  | { type: 'deleteSet' }

const label = (k: SerialKind) => (k === 'prefab' ? 'Prefab Serial' : 'Shell Serial')

export function SetScreen({ set, store, nav }: ScreenProps & { set: ShellSet }) {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const done = set.status === 'completed'
  const count = set.shells.length
  const expected = set.expectedShells
  const close = () => setDialog(null)

  const saveEdit = async (shell: ShellItem, kind: SerialKind, value: string) => {
    await store.save(updateShellSerial(set, shell.id, kind, { value, method: 'manual' }))
    close()
  }

  const tryEdit = (shell: ShellItem, kind: SerialKind, value: string) => {
    const hits = findDuplicates(store.sets, kind, value, shell.id)
    if (hits.length) setDialog({ type: 'dup', shell, kind, value, hits })
    else void saveEdit(shell, kind, value)
  }

  const placeholders =
    !done && expected !== undefined && expected > count
      ? Array.from({ length: expected - count }, (_, i) => count + 1 + i)
      : !done
        ? [count + 1]
        : []

  return (
    <div className="screen">
      <TopBar title={set.name} onBack={nav.back} />
      <div className="set-summary">
        <div className="progress-text">
          {expected !== undefined
            ? `${count} / ${expected} shells completed`
            : `${count} ${count === 1 ? 'shell' : 'shells'} added`}
        </div>
        <div className={done ? 'status done' : 'status open'}>{done ? 'Completed' : 'In progress'}</div>
      </div>

      <ul className="shell-list">
        {set.shells.map((s) => (
          <li key={s.id}>
            <button type="button" className="shell-row" onClick={() => setDialog({ type: 'shell', shell: s })}>
              <span className="mark ok">✓</span>
              <span className="shell-row-main">
                <b>Shell {s.position}</b>
                <span className="mono">
                  Prefab {s.prefabSerial}
                  {s.prefabInputMethod === 'manual' && <em className="tag">manual</em>}
                </span>
                <span className="mono">
                  Shell {s.shellSerial}
                  {s.shellInputMethod === 'manual' && <em className="tag">manual</em>}
                </span>
              </span>
            </button>
          </li>
        ))}
        {placeholders.map((p, i) => (
          <li key={`p${p}`} className="shell-row placeholder">
            <span className={i === 0 ? 'mark next' : 'mark'}>{i === 0 ? '●' : '○'}</span>
            <span className="shell-row-main">
              <b>Shell {p}</b>
              {i === 0 && <span className="muted">next</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="bottom-actions">
        {!done && (
          <button type="button" className="btn btn-primary btn-xl" onClick={() => nav.push({ name: 'scan', id: set.id })}>
            {expected === undefined ? 'Add next shell' : count === 0 ? 'Start scanning' : 'Scan next shell'}
          </button>
        )}
        <div className="row">
          {!done && (
            <button type="button" className="btn" onClick={() => setDialog({ type: 'complete' })}>
              Complete Set
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={count === 0}
            onClick={() => void shareOrDownload(`${safeFileName(set.name)}.csv`, setsToCsv([set]), 'text/csv')}
          >
            Export current set
          </button>
        </div>
        <button type="button" className="btn btn-ghost danger-text" onClick={() => setDialog({ type: 'deleteSet' })}>
          Delete set
        </button>
      </div>

      {dialog?.type === 'shell' && (
        <Modal onClose={close}>
          <h2 className="modal-title">Shell {dialog.shell.position}</h2>
          {(['prefab', 'shell'] as const).map((k) => (
            <div key={k} className="edit-block">
              <div className="muted">{k === 'prefab' ? 'Prefab' : 'Shell'}</div>
              <div className="mono big">{k === 'prefab' ? dialog.shell.prefabSerial : dialog.shell.shellSerial}</div>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    close()
                    nav.push({ name: 'rescan', id: set.id, shellId: dialog.shell.id, kind: k })
                  }}
                >
                  Rescan
                </button>
                <button type="button" className="btn" onClick={() => setDialog({ type: 'edit', shell: dialog.shell, kind: k })}>
                  Edit
                </button>
              </div>
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={() => setDialog({ type: 'delete', shell: dialog.shell })}>
              Delete shell
            </button>
            <button type="button" className="btn" onClick={close}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {dialog?.type === 'edit' && (
        <ManualEntry
          title={label(dialog.kind)}
          initial={dialog.kind === 'prefab' ? dialog.shell.prefabSerial : dialog.shell.shellSerial}
          onCancel={close}
          onSubmit={(v) => tryEdit(dialog.shell, dialog.kind, v)}
        />
      )}

      {dialog?.type === 'dup' && (
        <DuplicateWarning
          hits={dialog.hits}
          onRetry={close}
          onOverride={() => void saveEdit(dialog.shell, dialog.kind, dialog.value)}
        />
      )}

      {dialog?.type === 'delete' && (
        <Confirm
          title={`Delete Shell ${dialog.shell.position}?`}
          body={
            <p className="mono">
              Prefab {dialog.shell.prefabSerial}
              <br />
              Shell {dialog.shell.shellSerial}
            </p>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            void store.save(removeShell(set, dialog.shell.id))
            close()
          }}
          onCancel={close}
        />
      )}

      {dialog?.type === 'complete' && (
        <CompleteSetDialog
          set={set}
          onConfirm={() => {
            void store.save(completeSet(set))
            close()
          }}
          onCancel={close}
        />
      )}

      {dialog?.type === 'deleteSet' && (
        <Confirm
          title={`Delete ${set.name}?`}
          body={<p>{count} shells will be removed from this device. Make a backup first if unsure.</p>}
          confirmLabel="Delete set"
          danger
          onConfirm={() => {
            close()
            nav.back()
            void store.remove(set.id)
          }}
          onCancel={close}
        />
      )}
    </div>
  )
}
