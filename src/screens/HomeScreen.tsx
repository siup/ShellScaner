import { Icon } from '../components/Icon'
import type { ScreenProps } from './types'

export function HomeScreen({ store, nav }: ScreenProps) {
  const count = store.sets.length
  const open = store.sets.filter((s) => s.status === 'in_progress').length
  return (
    <div className="screen home">
      <div className="home-head">
        <div className="app-badge">
          <Icon name="barcode" size={34} />
        </div>
        <div className="home-title">Shell Scanner</div>
        <div className="muted">
          {count} {count === 1 ? 'set' : 'sets'}
          {open > 0 && ` · ${open} in progress`}
        </div>
      </div>

      <div className="home-actions">
        <button type="button" className="btn btn-primary btn-xl" onClick={() => nav.push({ name: 'new' })}>
          <Icon name="plus" />
          New Set
        </button>

        <div className="group">
          <button type="button" className="group-row" onClick={() => nav.push({ name: 'sets' })}>
            <span className="row-icon blue">
              <Icon name="folder" size={18} />
            </span>
            <span className="row-label">Saved Sets</span>
            <span className="row-value">{count}</span>
            <Icon name="chevron" size={18} />
          </button>
          <button type="button" className="group-row" onClick={() => nav.push({ name: 'export' })}>
            <span className="row-icon green">
              <Icon name="share" size={18} />
            </span>
            <span className="row-label">Export Data</span>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
