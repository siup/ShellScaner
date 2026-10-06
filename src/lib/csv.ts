import type { ShellSet } from './types'

export const CSV_HEADER = [
  'Set',
  'Position',
  'Prefab Serial',
  'Shell Serial',
  'Prefab Input Method',
  'Shell Input Method',
  'Created At',
]

function cell(value: string | number): string {
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function setsToCsv(sets: ShellSet[]): string {
  const rows = [CSV_HEADER.join(',')]
  for (const set of sets) {
    for (const s of [...set.shells].sort((a, b) => a.position - b.position)) {
      rows.push(
        [
          set.name,
          s.position,
          s.prefabSerial,
          s.shellSerial,
          s.prefabInputMethod,
          s.shellInputMethod,
          s.createdAt,
        ]
          .map(cell)
          .join(','),
      )
    }
  }
  return rows.join('\r\n') + '\r\n'
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'set'
}
