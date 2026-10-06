import type { ScreenProps } from './types'

export function HomeScreen({ store, nav }: ScreenProps) {
  const count = store.sets.length
  return (
    <div className="screen home">
      <div className="home-head">
        <div className="home-title">Shell Scanner</div>
      </div>
      <div className="home-actions">
        <button type="button" className="btn btn-primary btn-xl" onClick={() => nav.push({ name: 'new' })}>
          New Set
        </button>
        <button type="button" className="btn btn-xl" onClick={() => nav.push({ name: 'sets' })}>
          Saved Sets <span className="badge">{count}</span>
        </button>
        <button type="button" className="btn btn-xl" onClick={() => nav.push({ name: 'export' })}>
          Export Data
        </button>
      </div>
    </div>
  )
}
