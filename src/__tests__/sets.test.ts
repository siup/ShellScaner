import { describe, expect, it } from 'vitest'
import {
  addShell,
  completeSet,
  createSet,
  findDuplicates,
  isShort,
  removeShell,
  updateShellSerial,
} from '../lib/sets'
import type { ScannedValue } from '../lib/types'

const bc = (value: string): ScannedValue => ({ value, method: 'barcode' })
const man = (value: string): ScannedValue => ({ value, method: 'manual' })

describe('createSet', () => {
  it('creates an in-progress set with optional expected count', () => {
    const s = createSet('  SET-001 ', 8)
    expect(s.name).toBe('SET-001')
    expect(s.expectedShells).toBe(8)
    expect(s.status).toBe('in_progress')
    expect(s.shells).toEqual([])
    expect(s.createdAt).toBe(s.updatedAt)
  })

  it('leaves expected count empty when not given or invalid', () => {
    expect(createSet('A').expectedShells).toBeUndefined()
    expect(createSet('A', 0).expectedShells).toBeUndefined()
    expect(createSet('A', NaN).expectedShells).toBeUndefined()
  })

  it('requires a name', () => {
    expect(() => createSet('   ')).toThrow()
  })
})

describe('addShell', () => {
  it('stores the prefab/shell pair with input methods and positions', () => {
    let s = createSet('SET-001', 8)
    s = addShell(s, bc('13682767'), bc('839662'))
    s = addShell(s, bc(' 13677741 '), man('839663'))
    expect(s.shells).toHaveLength(2)
    expect(s.shells[0]).toMatchObject({
      position: 1,
      prefabSerial: '13682767',
      shellSerial: '839662',
      prefabInputMethod: 'barcode',
      shellInputMethod: 'barcode',
    })
    expect(s.shells[1]).toMatchObject({
      position: 2,
      prefabSerial: '13677741',
      shellInputMethod: 'manual',
    })
    expect(s.shells[1].updatedAt).toBeTruthy()
  })

  it('rejects empty serials', () => {
    expect(() => addShell(createSet('A'), bc(''), bc('1'))).toThrow()
  })
})

describe('findDuplicates', () => {
  const a = addShell(addShell(createSet('SET-001'), bc('111'), bc('aaa')), bc('222'), bc('bbb'))
  const b = addShell(createSet('SET-002'), bc('333'), bc('ccc'))

  it('finds a prefab in the same set', () => {
    const hits = findDuplicates([a, b], 'prefab', '222')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ setName: 'SET-001', position: 2, kind: 'prefab' })
  })

  it('finds a shell serial in another set', () => {
    const hits = findDuplicates([a, b], 'shell', 'ccc')
    expect(hits[0]).toMatchObject({ setName: 'SET-002', position: 1 })
  })

  it('does not mix prefab and shell columns', () => {
    expect(findDuplicates([a, b], 'shell', '111')).toEqual([])
  })

  it('ignores the shell being edited', () => {
    expect(findDuplicates([a], 'prefab', '111', a.shells[0].id)).toEqual([])
    expect(findDuplicates([a], 'prefab', '111', a.shells[1].id)).toHaveLength(1)
  })

  it('trims before comparing', () => {
    expect(findDuplicates([a], 'prefab', ' 111 ')).toHaveLength(1)
  })
})

describe('editing', () => {
  const base = addShell(addShell(createSet('S'), bc('1'), bc('a')), bc('2'), bc('b'))

  it('changes a prefab serial and marks it manual', () => {
    const s = updateShellSerial(base, base.shells[0].id, 'prefab', man('9'))
    expect(s.shells[0].prefabSerial).toBe('9')
    expect(s.shells[0].prefabInputMethod).toBe('manual')
    expect(s.shells[0].shellSerial).toBe('a')
    expect(base.shells[0].prefabSerial).toBe('1') // original untouched
  })

  it('changes a shell serial from a rescan', () => {
    const s = updateShellSerial(base, base.shells[1].id, 'shell', bc('zz'))
    expect(s.shells[1]).toMatchObject({ shellSerial: 'zz', shellInputMethod: 'barcode' })
  })

  it('throws for unknown shell', () => {
    expect(() => updateShellSerial(base, 'nope', 'shell', bc('x'))).toThrow()
  })

  it('removes a shell and renumbers positions', () => {
    const s = removeShell(base, base.shells[0].id)
    expect(s.shells).toHaveLength(1)
    expect(s.shells[0]).toMatchObject({ prefabSerial: '2', position: 1 })
  })
})

describe('completeSet', () => {
  it('marks the set completed and detects short sets', () => {
    const s = addShell(createSet('S', 8), bc('1'), bc('a'))
    expect(isShort(s)).toBe(true)
    const done = completeSet(s)
    expect(done.status).toBe('completed')
    expect(done.completedAt).toBeTruthy()
    expect(isShort(addShell(createSet('S'), bc('1'), bc('a')))).toBe(false)
  })
})
