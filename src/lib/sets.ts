import { newId, nowIso } from './id'
import type { DuplicateHit, ScannedValue, SerialKind, ShellItem, ShellSet } from './types'

export function normalizeSerial(raw: string): string {
  return raw.trim()
}

export function createSet(name: string, expectedShells?: number): ShellSet {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Set name is required')
  const expected =
    expectedShells !== undefined && Number.isFinite(expectedShells) && expectedShells > 0
      ? Math.floor(expectedShells)
      : undefined
  const t = nowIso()
  return {
    id: newId(),
    name: trimmed,
    expectedShells: expected,
    status: 'in_progress',
    createdAt: t,
    updatedAt: t,
    shells: [],
  }
}

function renumber(shells: ShellItem[]): ShellItem[] {
  return shells.map((s, i) => (s.position === i + 1 ? s : { ...s, position: i + 1 }))
}

export function addShell(set: ShellSet, prefab: ScannedValue, shell: ScannedValue): ShellSet {
  const prefabSerial = normalizeSerial(prefab.value)
  const shellSerial = normalizeSerial(shell.value)
  if (!prefabSerial || !shellSerial) throw new Error('Both serial numbers are required')
  const t = nowIso()
  const item: ShellItem = {
    id: newId(),
    position: set.shells.length + 1,
    prefabSerial,
    prefabInputMethod: prefab.method,
    shellSerial,
    shellInputMethod: shell.method,
    createdAt: t,
    updatedAt: t,
  }
  return { ...set, shells: [...set.shells, item], updatedAt: t }
}

export function updateShellSerial(
  set: ShellSet,
  shellId: string,
  kind: SerialKind,
  next: ScannedValue,
): ShellSet {
  const value = normalizeSerial(next.value)
  if (!value) throw new Error('Serial number is required')
  const t = nowIso()
  let found = false
  const shells = set.shells.map((s) => {
    if (s.id !== shellId) return s
    found = true
    return kind === 'prefab'
      ? { ...s, prefabSerial: value, prefabInputMethod: next.method, updatedAt: t }
      : { ...s, shellSerial: value, shellInputMethod: next.method, updatedAt: t }
  })
  if (!found) throw new Error('Shell not found')
  return { ...set, shells, updatedAt: t }
}

export function removeShell(set: ShellSet, shellId: string): ShellSet {
  const shells = renumber(set.shells.filter((s) => s.id !== shellId))
  return { ...set, shells, updatedAt: nowIso() }
}

export function completeSet(set: ShellSet): ShellSet {
  const t = nowIso()
  return { ...set, status: 'completed', completedAt: t, updatedAt: t }
}

export function reopenSet(set: ShellSet): ShellSet {
  return { ...set, status: 'in_progress', completedAt: undefined, updatedAt: nowIso() }
}

/** True when the set has an expected count and fewer shells were scanned. */
export function isShort(set: ShellSet): boolean {
  return set.expectedShells !== undefined && set.shells.length < set.expectedShells
}

/**
 * Looks for a serial in every set. Prefab and shell serials are checked against
 * their own column only. `ignoreShellId` skips the shell being edited.
 */
export function findDuplicates(
  sets: ShellSet[],
  kind: SerialKind,
  rawValue: string,
  ignoreShellId?: string,
): DuplicateHit[] {
  const value = normalizeSerial(rawValue)
  if (!value) return []
  const hits: DuplicateHit[] = []
  for (const set of sets) {
    for (const s of set.shells) {
      if (s.id === ignoreShellId) continue
      const existing = kind === 'prefab' ? s.prefabSerial : s.shellSerial
      if (existing === value) {
        hits.push({
          kind,
          value,
          setId: set.id,
          setName: set.name,
          shellId: s.id,
          position: s.position,
        })
      }
    }
  }
  return hits
}

export function sortSetsNewestFirst(sets: ShellSet[]): ShellSet[] {
  return [...sets].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
