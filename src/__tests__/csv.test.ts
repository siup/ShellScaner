import { describe, expect, it } from 'vitest'
import { setsToCsv } from '../lib/csv'
import type { ShellSet } from '../lib/types'

const set = (name: string, rows: [string, string, 'barcode' | 'manual'][]): ShellSet => ({
  id: name,
  name,
  status: 'in_progress',
  createdAt: '2026-10-06T12:00:00.000Z',
  updatedAt: '2026-10-06T12:00:00.000Z',
  shells: rows.map(([p, s, m], i) => ({
    id: `${name}-${i}`,
    position: i + 1,
    prefabSerial: p,
    prefabInputMethod: 'barcode',
    shellSerial: s,
    shellInputMethod: m,
    createdAt: `2026-10-06T12:0${i}:00.000Z`,
    updatedAt: `2026-10-06T12:0${i}:00.000Z`,
  })),
})

describe('setsToCsv', () => {
  it('writes header and one row per shell', () => {
    const csv = setsToCsv([
      set('SET-001', [
        ['13682767', '839662', 'barcode'],
        ['13677741', '839663', 'manual'],
      ]),
    ])
    expect(csv.trim().split('\r\n')).toEqual([
      'Set,Position,Prefab Serial,Shell Serial,Prefab Input Method,Shell Input Method,Created At',
      'SET-001,1,13682767,839662,barcode,barcode,2026-10-06T12:00:00.000Z',
      'SET-001,2,13677741,839663,barcode,manual,2026-10-06T12:01:00.000Z',
    ])
  })

  it('exports several sets and keeps leading zeros', () => {
    const csv = setsToCsv([set('A', [['0012', '1', 'barcode']]), set('B', [['2', '2', 'barcode']])])
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain(',0012,')
    expect(lines[2].startsWith('B,1,')).toBe(true)
  })

  it('quotes values with commas and quotes', () => {
    const csv = setsToCsv([set('SET, "x"', [['1', '2', 'barcode']])])
    expect(csv.split('\r\n')[1].startsWith('"SET, ""x""",1,')).toBe(true)
  })

  it('sorts rows by position', () => {
    const s = set('S', [
      ['1', 'a', 'barcode'],
      ['2', 'b', 'barcode'],
    ])
    s.shells.reverse()
    const lines = setsToCsv([s]).trim().split('\r\n')
    expect(lines[1].startsWith('S,1,1,a')).toBe(true)
  })
})
