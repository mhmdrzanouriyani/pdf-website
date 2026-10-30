/**
 * Recent documents, persisted in this browser with IndexedDB.
 * The file bytes are stored as Blobs, so documents survive page reloads —
 * but only on this device and browser profile. Nothing is uploaded.
 */
import { LIMITS } from '../config/limits'

export type DocStatus = 'ready' | 'locked' | 'error'

export type StoredDocMeta = {
  id: string
  name: string
  size: number
  type: string
  pageCount: number | null
  status: DocStatus
  error?: string
  addedAt: number
  openedAt: number
}

type StoredDocRecord = StoredDocMeta & { blob: Blob }

const DB_NAME = 'pdfly'
const DB_VERSION = 1
const STORE = 'documents'

let dbPromise: Promise<IDBDatabase> | null = null

export class StorageUnavailableError extends Error {
  constructor() {
    super('Browser storage is unavailable (private mode or blocked site data). Documents will not be remembered after you leave.')
    this.name = 'StorageUnavailableError'
  }
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageUnavailableError())
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('openedAt', 'openedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new StorageUnavailableError())
    request.onblocked = () => reject(new StorageUnavailableError())
  }).catch((error) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const store = transaction.objectStore(STORE)
        const request = run(store)
        let result: T
        if (request) request.onsuccess = () => (result = request.result)
        transaction.oncomplete = () => resolve(result)
        transaction.onerror = () => reject(transaction.error ?? new Error('Storage error'))
        transaction.onabort = () =>
          reject(
            transaction.error?.name === 'QuotaExceededError'
              ? new Error('Your browser storage is full. Remove some recent documents and try again.')
              : (transaction.error ?? new Error('Storage error')),
          )
      }),
  )
}

function stripBlob(record: StoredDocRecord): StoredDocMeta {
  const { blob: _blob, ...meta } = record
  void _blob
  return meta
}

export async function listDocs(): Promise<StoredDocMeta[]> {
  const all = await tx<StoredDocRecord[]>('readonly', (store) => store.getAll())
  return (all ?? []).map(stripBlob).sort((a, b) => b.openedAt - a.openedAt)
}

export async function getDocBlob(id: string): Promise<Blob | null> {
  const record = await tx<StoredDocRecord | undefined>('readonly', (store) => store.get(id))
  return record?.blob ?? null
}

export async function putDoc(meta: StoredDocMeta, blob: Blob) {
  await tx('readwrite', (store) => store.put({ ...meta, blob } satisfies StoredDocRecord))
  await enforceLimits(meta.id)
}

export async function updateDoc(id: string, patch: Partial<Omit<StoredDocMeta, 'id'>>) {
  const record = await tx<StoredDocRecord | undefined>('readonly', (store) => store.get(id))
  if (!record) return
  await tx('readwrite', (store) => store.put({ ...record, ...patch }))
}

export async function deleteDoc(id: string) {
  await tx('readwrite', (store) => store.delete(id))
}

export async function clearDocs() {
  await tx('readwrite', (store) => store.clear())
}

/** Evicts the least recently opened documents beyond the configured count/size limits. */
async function enforceLimits(keepId: string) {
  const docs = await listDocs()
  let total = docs.reduce((sum, doc) => sum + doc.size, 0)
  const victims: string[] = []
  for (let i = docs.length - 1; i >= 0; i -= 1) {
    const over = docs.length - victims.length > LIMITS.maxStoredDocuments || total > LIMITS.maxStoredBytes
    if (!over) break
    if (docs[i].id === keepId) continue
    victims.push(docs[i].id)
    total -= docs[i].size
  }
  for (const id of victims) await deleteDoc(id)
}

export function newDocId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
