import { useCallback, useState } from 'react'
import { CompleteSetDialog } from '../components/CompleteSetDialog'
import { SerialScanner } from '../components/SerialScanner'
import { addShell, completeSet } from '../lib/sets'
import type { ScannedValue, ShellItem, ShellSet } from '../lib/types'
import type { ScreenProps } from './types'

type Step = 'prefab' | 'shell' | 'added'

export function ScanFlowScreen({ set, store, nav }: ScreenProps & { set: ShellSet }) {
  const [step, setStep] = useState<Step>('prefab')
  const [prefab, setPrefab] = useState<ScannedValue | null>(null)
  const [added, setAdded] = useState<ShellItem | null>(null)
  const [completing, setCompleting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const count = set.shells.length
  const expected = set.expectedShells
  const position = count + (step === 'added' ? 0 : 1)
  const full = expected !== undefined && count >= expected

  const onAccepted = useCallback(
    async (v: ScannedValue) => {
      if (step === 'prefab') {
        setPrefab(v)
        setStep('shell')
        return
      }
      if (step === 'shell' && prefab) {
        try {
          const next = addShell(set, prefab, v)
          await store.save(next)
          setAdded(next.shells[next.shells.length - 1])
          setPrefab(null)
          setStep('added')
          setSaveError(null)
        } catch {
          setSaveError('Could not save. Try again.')
        }
      }
    },
    [step, prefab, set, store],
  )

  const nextShell = () => {
    setAdded(null)
    setStep('prefab')
  }

  const header = (
    <div className="scan-header">
      <button type="button" className="chip" onClick={nav.back}>
        ‹ {set.name}
      </button>
      <span className="chip">
        Shell {position}
        {expected !== undefined && ` / ${expected}`}
      </span>
    </div>
  )

  return (
    <div className="screen scan-screen">
      <SerialScanner
        kind={step === 'shell' ? 'shell' : 'prefab'}
        sets={store.sets}
        pairedValue={step === 'shell' ? prefab?.value : undefined}
        paused={step === 'added' || completing}
        onAccepted={(v) => void onAccepted(v)}
        header={
          <>
            {header}
            {step === 'shell' && prefab && (
              <div className="pending-prefab">
                ✓ Prefab <span className="mono">{prefab.value}</span>
              </div>
            )}
            {saveError && <div className="pending-prefab warn">{saveError}</div>}
          </>
        }
        extraActions={
          step === 'shell' ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPrefab(null)
                setStep('prefab')
              }}
            >
              Redo prefab
            </button>
          ) : undefined
        }
      />

      {step === 'added' && added && (
        <div className="sheet">
          <div className="sheet-title ok-text">✓ Shell added</div>
          <div className="pair">
            <div>
              <div className="muted">Prefab</div>
              <div className="mono big">{added.prefabSerial}</div>
            </div>
            <div>
              <div className="muted">Shell</div>
              <div className="mono big">{added.shellSerial}</div>
            </div>
          </div>
          <div className="muted center-text">
            {expected !== undefined ? `${count} / ${expected} shells` : `${count} shells added`}
          </div>
          {full ? (
            <>
              <button type="button" className="btn btn-primary btn-xl" onClick={() => setCompleting(true)}>
                Complete Set
              </button>
              <button type="button" className="btn" onClick={nextShell}>
                Add another shell
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-xl" onClick={nextShell} autoFocus>
                Next Shell
              </button>
              <div className="row">
                <button type="button" className="btn" onClick={nav.back}>
                  Show list
                </button>
                <button type="button" className="btn" onClick={() => setCompleting(true)}>
                  Complete Set
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {completing && (
        <CompleteSetDialog
          set={set}
          onCancel={() => setCompleting(false)}
          onConfirm={async () => {
            await store.save(completeSet(set))
            setCompleting(false)
            nav.back()
          }}
        />
      )}
    </div>
  )
}
