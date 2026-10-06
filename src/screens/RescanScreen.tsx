import { SerialScanner } from '../components/SerialScanner'
import { updateShellSerial } from '../lib/sets'
import type { SerialKind, ShellItem, ShellSet } from '../lib/types'
import type { ScreenProps } from './types'

export function RescanScreen({
  set,
  shell,
  kind,
  store,
  nav,
}: ScreenProps & { set: ShellSet; shell: ShellItem; kind: SerialKind }) {
  const current = kind === 'prefab' ? shell.prefabSerial : shell.shellSerial
  return (
    <div className="screen scan-screen">
      <SerialScanner
        kind={kind}
        sets={store.sets}
        ignoreShellId={shell.id}
        pairedValue={kind === 'prefab' ? shell.shellSerial : shell.prefabSerial}
        onAccepted={async (v) => {
          await store.save(updateShellSerial(set, shell.id, kind, v))
          nav.back()
        }}
        header={
          <>
            <div className="scan-header">
              <button type="button" className="chip" onClick={nav.back}>
                ‹ Cancel
              </button>
              <span className="chip">
                {set.name} · Shell {shell.position}
              </span>
            </div>
            <div className="pending-prefab">
              Current <span className="mono">{current}</span>
            </div>
          </>
        }
      />
    </div>
  )
}
