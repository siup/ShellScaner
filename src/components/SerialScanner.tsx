import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { checkRules, scanConfig, type BarcodeFormatName } from '../config'
import { errorFeedback, successFeedback } from '../lib/feedback'
import { findDuplicates, normalizeSerial } from '../lib/sets'
import type { DuplicateHit, InputMethod, ScannedValue, SerialKind, ShellSet } from '../lib/types'
import { CameraScanner } from '../scanner/CameraScanner'
import { DuplicateWarning } from './DuplicateWarning'
import { ManualEntry } from './ManualEntry'

const TEXT: Record<SerialKind, { title: string; hint: string; detected: string; manual: string }> = {
  prefab: {
    title: 'SCAN PREFAB SERIAL',
    hint: 'Aim at the prefab serial barcode',
    detected: 'Prefab detected',
    manual: 'Prefab Serial',
  },
  shell: {
    title: 'SCAN SHELL SERIAL',
    hint: 'Aim at the shell serial barcode',
    detected: 'Shell detected',
    manual: 'Shell Serial',
  },
}

// Shows the "Simulate scan" button for testing on a desktop without a camera.
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
      if (ruleError && method === 'barcode') {
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
  const active = !paused && !success && !dup && !entry

  return (
    <>
      <CameraScanner
        title={t.title}
        hint={t.hint}
        active={active}
        onScan={(v, f) => handle(v, 'barcode', f)}
        success={success ? { label: t.detected, value: success.value } : null}
        message={message}
        header={header}
        actions={
          <>
            <button type="button" className="btn btn-manual" onClick={() => setEntry('manual')}>
              Enter manually
            </button>
            {SIMULATE && (
              <button type="button" className="btn" onClick={() => setEntry('barcode')}>
                Simulate scan
              </button>
            )}
            {extraActions}
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
