import { Icon } from '../components/Icon'
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
      <TopBar title="Saved Sets" onBack={nav.back} backLabel="Home" />
      {sets.length === 0 && <p className="empty">No sets yet.</p>}
      {sets.length > 0 && (
        <div className="group">
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              className="group-row tall"
              onClick={() => nav.push({ name: 'set', id: s.id })}
            >
              <span className="row-main">
                <span className="card-title">{s.name}</span>
                <span className="muted small">
                  {shellCountLabel(s)} · {formatDate(s.completedAt ?? s.createdAt)}
                </span>
              </span>
              <span className={s.status === 'completed' ? 'pill done' : 'pill open'}>
                {s.status === 'completed' ? 'Completed' : 'In progress'}
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
