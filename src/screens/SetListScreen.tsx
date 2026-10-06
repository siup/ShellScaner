import { TopBar } from '../components/TopBar'
import { sortSetsNewestFirst } from '../lib/sets'
import { formatDate } from '../lib/share'
import type { ShellSet } from '../lib/types'
import type { ScreenProps } from './types'

export function shellCountLabel(set: ShellSet): string {
  const n = set.shells.length
  if (set.expectedShells !== undefined && n !== set.expectedShells) return `${n} / ${set.expectedShells} shells`
  return `${n} ${n === 1 ? 'shell' : 'shells'}`
}

export function SetListScreen({ store, nav }: ScreenProps) {
  const sets = sortSetsNewestFirst(store.sets)
  return (
    <div className="screen">
      <TopBar title="Saved Sets" onBack={nav.back} />
      {sets.length === 0 && <p className="empty">No sets yet.</p>}
      <ul className="card-list">
        {sets.map((s) => (
          <li key={s.id}>
            <button type="button" className="card" onClick={() => nav.push({ name: 'set', id: s.id })}>
              <div className="card-title">{s.name}</div>
              <div>{shellCountLabel(s)}</div>
              <div className={s.status === 'completed' ? 'status done' : 'status open'}>
                {s.status === 'completed' ? 'Completed' : 'In progress'}
              </div>
              <div className="muted">{formatDate(s.completedAt ?? s.createdAt)}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
