import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { backupToJson, parseBackup } from '../lib/backup'
import { clearAll, getAllSets, saveSet, saveSets } from '../lib/db'
import { addShell, completeSet, createSet } from '../lib/sets'

const sample = () => {
  const a = completeSet(
    addShell(createSet('SET-001', 2), { value: '13682767', method: 'barcode' }, { value: '839662', method: 'manual' }),
  )
  const b = createSet('SET-002')
  return [a, b]
}

describe('backup / restore', () => {
  beforeEach(async () => {
    await clearAll()
  })

  it('round-trips all sets through JSON', () => {
    const sets = sample()
    const restored = parseBackup(backupToJson(sets))
    expect(restored).toEqual(sets)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON')
    expect(() => parseBackup('{"foo":1}')).toThrow('not a Shell Scanner backup')
    expect(() =>
      parseBackup(JSON.stringify({ app: 'shell-serial-scanner', version: 1, sets: [{ id: 1 }] })),
    ).toThrow('Invalid set')
    expect(() => parseBackup(JSON.stringify({ app: 'shell-serial-scanner', version: 99, sets: [] }))).toThrow(
      'newer',
    )
  })

  it('stores sets in IndexedDB and restores them after wipe', async () => {
    const sets = sample()
    for (const s of sets) await saveSet(s)
    const json = backupToJson(await getAllSets())

    await clearAll()
    expect(await getAllSets()).toEqual([])

    await saveSets(parseBackup(json))
    const back = await getAllSets()
    expect(back).toHaveLength(2)
    const a = back.find((s) => s.name === 'SET-001')!
    expect(a.status).toBe('completed')
    expect(a.shells[0]).toMatchObject({ prefabSerial: '13682767', shellInputMethod: 'manual' })
  })

  it('restore keeps other sets and replaces ones with same id', async () => {
    const [a, b] = sample()
    await saveSet(a)
    const other = createSet('LOCAL-ONLY')
    await saveSet(other)
    const renamed = { ...a, name: 'SET-001-restored' }
    await saveSets(parseBackup(backupToJson([renamed, b])))
    const names = (await getAllSets()).map((s) => s.name).sort()
    expect(names).toEqual(['LOCAL-ONLY', 'SET-001-restored', 'SET-002'])
  })
})
