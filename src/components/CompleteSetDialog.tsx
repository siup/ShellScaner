import type { ShellSet } from '../lib/types'
import { Confirm } from './Modal'

export function CompleteSetDialog({
  set,
  onConfirm,
  onCancel,
}: {
  set: ShellSet
  onConfirm: () => void
  onCancel: () => void
}) {
  const short = set.expectedShells !== undefined && set.shells.length < set.expectedShells
  return short ? (
    <Confirm
      title="Set not full"
      body={
        <>
          <p>Expected: {set.expectedShells}</p>
          <p>Scanned: {set.shells.length}</p>
          <p>
            <b>Complete anyway?</b>
          </p>
        </>
      }
      confirmLabel="Complete anyway"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  ) : (
    <Confirm
      title={`Complete ${set.name}?`}
      body={<p>{set.shells.length} shells</p>}
      confirmLabel="Complete Set"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
