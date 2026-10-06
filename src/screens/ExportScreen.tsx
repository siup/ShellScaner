import { useRef, useState, type ChangeEvent } from 'react'
import { Confirm } from '../components/Modal'
import { TopBar } from '../components/TopBar'
import { backupToJson, parseBackup } from '../lib/backup'
import { setsToCsv } from '../lib/csv'
import * as db from '../lib/db'
import { sortSetsNewestFirst } from '../lib/sets'
import { shareOrDownload, stamp } from '../lib/share'
import type { ShellSet } from '../lib/types'
import type { ScreenProps } from './types'

export function ExportScreen({ store, nav }: ScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ShellSet[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const sets = sortSetsNewestFirst(store.sets)
  const shells = sets.reduce((n, s) => n + s.shells.length, 0)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPending(parseBackup(await file.text()))
      setMsg(null)
    } catch (err) {
      setMsg((err as Error).message)
    }
  }

  return (
    <div className="screen">
      <TopBar title="Export Data" onBack={nav.back} />
      <p className="muted center-text">
        {sets.length} sets · {shells} shells
      </p>
      <div className="stack">
        <button
          type="button"
          className="btn btn-primary btn-xl"
          disabled={shells === 0}
          onClick={() => void shareOrDownload(`shells-all-${stamp()}.csv`, setsToCsv(sets), 'text/csv')}
        >
          Export all sets (CSV)
        </button>
        <button
          type="button"
          className="btn btn-xl"
          disabled={sets.length === 0}
          onClick={() =>
            void shareOrDownload(`shell-scanner-backup-${stamp()}.json`, backupToJson(sets), 'application/json')
          }
        >
          Backup
        </button>
        <button type="button" className="btn btn-xl" onClick={() => fileRef.current?.click()}>
          Restore backup
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e)} />
      </div>
      {msg && <p className="notice">{msg}</p>}
      <p className="muted small center-text">Data is stored only on this device. Back up regularly.</p>

      {pending && (
        <Confirm
          title="Restore backup?"
          body={
            <p>
              {pending.length} sets, {pending.reduce((n, s) => n + s.shells.length, 0)} shells. Sets with the same ID on
              this device will be replaced, other sets stay.
            </p>
          }
          confirmLabel="Restore"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const list = pending
            setPending(null)
            try {
              await db.saveSets(list)
              await store.reload()
              setMsg(`Restored ${list.length} sets.`)
            } catch {
              setMsg('Restore failed.')
            }
          }}
        />
      )}
    </div>
  )
}
