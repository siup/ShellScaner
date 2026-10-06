import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { checkRules, scanConfig, type BarcodeFormatName } from '../config'
import { errorFeedback, successFeedback } from '../lib/feedback'
import { findDuplicates, normalizeSerial } from '../lib/sets'
import type { DuplicateHit, InputMethod, ScannedValue, SerialKind, ShellSet } from '../lib/types'
import { CameraScanner } from '../scanner/CameraScanner'
import { DuplicateWarning } from './DuplicateWarning'
import { ManualEntry } from './ManualEntry'
import { Modal } from './Modal'
import { PhotoPicker } from '../photo/PhotoPicker'
import { Icon } from './Icon'

const TEXT: Record<
  SerialKind,
  { title: string; hint: string; ocrHint: string; detected: string; manual: string }
> = {
  prefab: {
    title: 'SCAN PREFAB SERIAL',
    hint: 'Aim at the prefab serial barcode',
    ocrHint: 'Aim at the Production Order number',
    detected: 'Prefab detected',
    manual: 'Prefab Serial',
  },
  shell: {
    title: 'SCAN SHELL SERIAL',
    hint: 'Aim at the shell serial barcode',
    ocrHint: 'Aim at the Serial no. text',
    detected: 'Shell detected',
    manual: 'Shell Serial',
  },
}

// Shows the "Simulate scan" button for testing on a desktop without a camera.
type Mode = 'barcode' | 'ocr'
const modeKey = (k: SerialKind) => `scanner.mode.${k}`

function savedMode(kind: SerialKind): Mode {
  try {
    return localStorage.getItem(modeKey(kind)) === 'ocr' ? 'ocr' : 'barcode'
  } catch {
    return 'barcode'
  }
}

const SIMULATE =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')

export function SerialScanner({
  kind,
  sets,
  ignoreShellId,
  pairedValue,
  paused,
  onAccepted,
  header,
  extraActions,
}: {
  kind: SerialKind
  sets: ShellSet[]
  ignoreShellId?: string
  /** The other serial of the same shell; scanning it again here is a mistake. */
  pairedValue?: string
  paused?: boolean
  onAccepted: (value: ScannedValue) => void
  header?: ReactNode
  extraActions?: ReactNode
}) {
  const [success, setSuccess] = useState<ScannedValue | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dup, setDup] = useState<{ scanned: ScannedValue; hits: DuplicateHit[] } | null>(null)
  const [entry, setEntry] = useState<InputMethod | null>(null) // manual / simulated barcode
  const [modes, setModes] = useState<Record<SerialKind, Mode>>(() => ({
    prefab: savedMode('prefab'),
    shell: savedMode('shell'),
  }))
  const [ocrRead, setOcrRead] = useState<string | null>(null) // waiting for confirmation
  const [ocrEdit, setOcrEdit] = useState<string | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mode = modes[kind]

  const toggleMode = () => {
    const next: Mode = mode === 'ocr' ? 'barcode' : 'ocr'
    setModes((m) => ({ ...m, [kind]: next }))
    setMessage(null)
    try {
      localStorage.setItem(modeKey(kind), next)
    } catch {
      // ignore
    }
  }
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])
  // reset per-step UI when the step changes (keeps the camera mounted)
  const [shownKind, setShownKind] = useState(kind)
  if (shownKind !== kind) {
    setShownKind(kind)
    setMessage(null)
    setSuccess(null)
  }

  const accept = useCallback(
    (scanned: ScannedValue) => {
      successFeedback()
      setMessage(null)
      setSuccess(scanned)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setSuccess(null)
        onAccepted(scanned)
      }, scanConfig.advanceDelayMs)
    },
    [onAccepted],
  )

  const handle = useCallback(
    (raw: string, method: InputMethod, format?: BarcodeFormatName): boolean => {
      const value = normalizeSerial(raw)
      if (!value) return false
      if (pairedValue && value === pairedValue) {
        errorFeedback()
        setMessage(`Same number as the ${kind === 'shell' ? 'prefab' : 'shell'} serial: ${value}`)
        return false
      }
      const ruleError = checkRules(kind, value, format)
      if (ruleError && method !== 'manual') {
        errorFeedback()
        setMessage(`${ruleError}: ${value}`)
        return false
      }
      const hits = findDuplicates(sets, kind, value, ignoreShellId)
      if (hits.length > 0) {
        errorFeedback()
        setDup({ scanned: { value, method }, hits }) // dialog pauses scanning
        return true
      }
      accept({ value, method })
      return true
    },
    [kind, sets, ignoreShellId, pairedValue, accept],
  )

  const t = TEXT[kind]
  const active = !paused && !success && !dup && !entry && !ocrRead && ocrEdit === null && !photo

  return (
    <>
      <CameraScanner
        title={t.title}
        hint={mode === 'ocr' ? t.ocrHint : t.hint}
        active={active}
        engine={mode}
        ocrKind={kind}
        onScan={(v, f) => {
          if (mode === 'barcode') return handle(v, 'barcode', f)
          // OCR can misread digits, so a person always confirms the number
          successFeedback()
          setOcrRead(v)
          return true
        }}
        success={success ? { label: t.detected, value: success.value } : null}
        message={message}
        header={header}
        actions={
          <>
            <button type="button" className="tool" onClick={() => setEntry('manual')}>
              <Icon name="keyboard" />
              <span>Enter manually</span>
            </button>
            <button type="button" className={mode === 'ocr' ? 'tool on' : 'tool'} onClick={toggleMode}>
              <Icon name="text" />
              <span>{mode === 'ocr' ? 'OCR on' : 'Read text'}</span>
            </button>
            <button type="button" className="tool" onClick={() => fileRef.current?.click()}>
              <Icon name="photo" />
              <span>Photo</span>
            </button>
          </>
        }
        extras={
          <>
            {extraActions}
            {SIMULATE && (
              <button type="button" className="pill-btn" onClick={() => setEntry('barcode')}>
                Simulate scan
              </button>
            )}
          </>
        }
      />
      {entry && (
        <ManualEntry
          title={entry === 'manual' ? t.manual : `Simulate ${t.manual} barcode`}
          confirmLabel="OK"
          onCancel={() => setEntry(null)}
          onSubmit={(v) => {
            setEntry(null)
            handle(v, entry)
          }}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) setPhoto(f)
        }}
      />
      {photo && (
        <PhotoPicker
          file={photo}
          kind={kind}
          onCancel={() => setPhoto(null)}
          onManual={() => {
            setPhoto(null)
            setEntry('manual')
          }}
          onPick={(value, method) => {
            setPhoto(null)
            handle(value, method)
          }}
        />
      )}
      {ocrRead && (
        <Modal>
          <h2 className="modal-title">Read from text</h2>
          <div className="modal-body">
            <p className="muted">Check that the number matches the label.</p>
            <div className="ocr-value mono">{ocrRead}</div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const v = ocrRead
                setOcrRead(null)
                handle(v, 'ocr')
              }}
            >
              Correct
            </button>
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setOcrEdit(ocrRead)
                  setOcrRead(null)
                }}
              >
                Fix
              </button>
              <button type="button" className="btn" onClick={() => setOcrRead(null)}>
                Read again
              </button>
            </div>
          </div>
        </Modal>
      )}
      {ocrEdit !== null && (
        <ManualEntry
          title={t.manual}
          initial={ocrEdit}
          confirmLabel="OK"
          onCancel={() => setOcrEdit(null)}
          onSubmit={(v) => {
            setOcrEdit(null)
            // an unchanged value keeps its OCR origin, anything typed counts as manual
            handle(v, v === ocrEdit ? 'ocr' : 'manual')
          }}
        />
      )}
      {dup && (
        <DuplicateWarning
          hits={dup.hits}
          onRetry={() => setDup(null)}
          onOverride={() => {
            const s = dup.scanned
            setDup(null)
            accept(s)
          }}
        />
      )}
    </>
  )
}
