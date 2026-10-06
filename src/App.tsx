import { useCallback, useEffect, useState } from 'react'
import * as db from './lib/db'
import { unlockAudio } from './lib/feedback'
import type { ShellSet } from './lib/types'
import { useNav } from './nav'
import { ExportScreen } from './screens/ExportScreen'
import { HomeScreen } from './screens/HomeScreen'
import { NewSetScreen } from './screens/NewSetScreen'
import { RescanScreen } from './screens/RescanScreen'
import { ScanFlowScreen } from './screens/ScanFlowScreen'
import { SetListScreen } from './screens/SetListScreen'
import { SetScreen } from './screens/SetScreen'

export interface Store {
  sets: ShellSet[]
  save: (set: ShellSet) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => Promise<void>
}

export default function App() {
  const nav = useNav()
  const [sets, setSets] = useState<ShellSet[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setSets(await db.getAllSets())
  }, [])

  useEffect(() => {
    db.getAllSets()
      .then(setSets)
      .catch(() => setError('Local storage (IndexedDB) is not available in this browser.'))
    void db.requestPersistence()
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  const save = useCallback(async (set: ShellSet) => {
    await db.saveSet(set)
    setSets((prev) => {
      const list = prev ?? []
      return list.some((s) => s.id === set.id)
        ? list.map((s) => (s.id === set.id ? set : s))
        : [...list, set]
    })
  }, [])

  const remove = useCallback(async (id: string) => {
    await db.deleteSet(id)
    setSets((prev) => (prev ?? []).filter((s) => s.id !== id))
  }, [])

  if (error) return <div className="screen center"><p>{error}</p></div>
  if (!sets) return <div className="screen center" />

  const store: Store = { sets, save, remove, reload }
  const r = nav.route
  const find = (id: string) => sets.find((s) => s.id === id)

  switch (r.name) {
    case 'home':
      return <HomeScreen store={store} nav={nav} />
    case 'new':
      return <NewSetScreen store={store} nav={nav} />
    case 'sets':
      return <SetListScreen store={store} nav={nav} />
    case 'export':
      return <ExportScreen store={store} nav={nav} />
    case 'set': {
      const set = find(r.id)
      return set ? <SetScreen set={set} store={store} nav={nav} /> : <Missing back={nav.back} />
    }
    case 'scan': {
      const set = find(r.id)
      return set ? <ScanFlowScreen set={set} store={store} nav={nav} /> : <Missing back={nav.back} />
    }
    case 'rescan': {
      const set = find(r.id)
      const shell = set?.shells.find((s) => s.id === r.shellId)
      return set && shell ? (
        <RescanScreen set={set} shell={shell} kind={r.kind} store={store} nav={nav} />
      ) : (
        <Missing back={nav.back} />
      )
    }
  }
}

function Missing({ back }: { back: () => void }) {
  return (
    <div className="screen center">
      <p>Not found.</p>
      <button type="button" className="btn" onClick={back}>
        Back
      </button>
    </div>
  )
}
