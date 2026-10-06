import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ShellSet } from './types'

interface ScannerDB extends DBSchema {
  sets: { key: string; value: ShellSet }
}

const DB_NAME = 'shell-scanner'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ScannerDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('sets')) {
          database.createObjectStore('sets', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function getAllSets(): Promise<ShellSet[]> {
  return (await db()).getAll('sets')
}

export async function getSet(id: string): Promise<ShellSet | undefined> {
  return (await db()).get('sets', id)
}

export async function saveSet(set: ShellSet): Promise<void> {
  await (await db()).put('sets', set)
}

export async function deleteSet(id: string): Promise<void> {
  await (await db()).delete('sets', id)
}

/** Upserts many sets in one transaction (used by restore). */
export async function saveSets(sets: ShellSet[]): Promise<void> {
  const tx = (await db()).transaction('sets', 'readwrite')
  await Promise.all([...sets.map((s) => tx.store.put(s)), tx.done])
}

export async function clearAll(): Promise<void> {
  await (await db()).clear('sets')
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // not supported, nothing to do
  }
}
