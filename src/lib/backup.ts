import type { InputMethod, ShellItem, ShellSet } from './types'

export const BACKUP_APP = 'shell-serial-scanner'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  sets: ShellSet[]
}

export function createBackup(sets: ShellSet[]): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), sets }
}

export function backupToJson(sets: ShellSet[]): string {
  return JSON.stringify(createBackup(sets), null, 2)
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isMethod = (v: unknown): v is InputMethod => v === 'barcode' || v === 'manual'

function parseShell(raw: unknown, idx: number): ShellItem {
  const s = raw as Record<string, unknown>
  if (
    !s ||
    !isStr(s.id) ||
    !isStr(s.prefabSerial) ||
    !isStr(s.shellSerial) ||
    !isMethod(s.prefabInputMethod) ||
    !isMethod(s.shellInputMethod) ||
    !isStr(s.createdAt)
  ) {
    throw new Error(`Invalid shell #${idx + 1}`)
  }
  return {
    id: s.id,
    position: typeof s.position === 'number' ? s.position : idx + 1,
    prefabSerial: s.prefabSerial,
    prefabInputMethod: s.prefabInputMethod,
    shellSerial: s.shellSerial,
    shellInputMethod: s.shellInputMethod,
    createdAt: s.createdAt,
    updatedAt: isStr(s.updatedAt) ? s.updatedAt : s.createdAt,
  }
}

function parseSet(raw: unknown, idx: number): ShellSet {
  const s = raw as Record<string, unknown>
  if (!s || !isStr(s.id) || !isStr(s.name) || !isStr(s.createdAt) || !Array.isArray(s.shells)) {
    throw new Error(`Invalid set #${idx + 1}`)
  }
  const status = s.status === 'completed' ? 'completed' : 'in_progress'
  return {
    id: s.id,
    name: s.name,
    expectedShells: typeof s.expectedShells === 'number' ? s.expectedShells : undefined,
    status,
    createdAt: s.createdAt,
    updatedAt: isStr(s.updatedAt) ? s.updatedAt : s.createdAt,
    completedAt: isStr(s.completedAt) ? s.completedAt : undefined,
    shells: s.shells.map(parseShell),
  }
}

/** Parses and validates a backup file. Throws with a readable message on bad input. */
export function parseBackup(json: string): ShellSet[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('File is not valid JSON')
  }
  const b = data as Partial<Backup>
  if (!b || b.app !== BACKUP_APP || !Array.isArray(b.sets)) {
    throw new Error('This is not a Shell Scanner backup')
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('Backup was made by a newer app version')
  }
  return b.sets.map(parseSet)
}
