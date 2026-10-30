import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  clearDocs,
  deleteDoc,
  getDocBlob,
  listDocs,
  newDocId,
  putDoc,
  StorageUnavailableError,
  updateDoc,
  type StoredDocMeta,
} from '../lib/docStore'
import { FileValidationError, validateFile } from '../lib/files'
import { PdfPasswordError } from '../lib/pdf/core'

type DocumentsContextValue = {
  docs: StoredDocMeta[]
  loading: boolean
  /** false when IndexedDB is blocked; documents then live only until the tab closes. */
  persistent: boolean
  addFiles: (files: File[]) => Promise<{ added: StoredDocMeta[]; errors: string[] }>
  getBlob: (id: string) => Promise<Blob | null>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  update: (id: string, patch: Partial<Omit<StoredDocMeta, 'id'>>) => Promise<void>
  touch: (id: string) => Promise<void>
  clear: () => Promise<void>
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

async function probePageCount(file: File): Promise<{ pageCount: number | null; status: StoredDocMeta['status']; error?: string }> {
  // Lazy-load pdf.js so the landing page stays light.
  const { openWithPdfjs, closePdf } = await import('../lib/pdf/pdfjs')
  try {
    const doc = await openWithPdfjs(new Uint8Array(await file.arrayBuffer()))
    const pageCount = doc.numPages
    await closePdf(doc)
    return { pageCount, status: 'ready' }
  } catch (error) {
    if (error instanceof PdfPasswordError) return { pageCount: null, status: 'locked' }
    return { pageCount: null, status: 'error', error: error instanceof Error ? error.message : 'Could not open' }
  }
}

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<StoredDocMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [persistent, setPersistent] = useState(true)
  const memory = useRef(new Map<string, { meta: StoredDocMeta; blob: Blob }>())

  const refresh = useCallback(async () => {
    if (!persistent) {
      setDocs([...memory.current.values()].map((entry) => entry.meta).sort((a, b) => b.openedAt - a.openedAt))
      return
    }
    try {
      setDocs(await listDocs())
    } catch (error) {
      if (error instanceof StorageUnavailableError) setPersistent(false)
    }
  }, [persistent])

  useEffect(() => {
    let cancelled = false
    listDocs()
      .then((list) => {
        if (!cancelled) setDocs(list)
      })
      .catch(() => {
        if (!cancelled) setPersistent(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const addFiles = useCallback<DocumentsContextValue['addFiles']>(
    async (files) => {
      const added: StoredDocMeta[] = []
      const errors: string[] = []
      for (const file of files) {
        try {
          await validateFile(file, ['pdf'])
        } catch (error) {
          errors.push(error instanceof FileValidationError ? error.message : `“${file.name}” could not be read.`)
          continue
        }
        const probe = await probePageCount(file)
        if (probe.status === 'error') {
          errors.push(`“${file.name}”: ${probe.error}`)
          continue
        }
        const now = Date.now()
        const meta: StoredDocMeta = {
          id: newDocId(),
          name: file.name,
          size: file.size,
          type: 'application/pdf',
          pageCount: probe.pageCount,
          status: probe.status,
          addedAt: now,
          openedAt: now + added.length,
        }
        if (persistent) {
          try {
            await putDoc(meta, file)
          } catch (error) {
            if (error instanceof StorageUnavailableError) {
              setPersistent(false)
              memory.current.set(meta.id, { meta, blob: file })
            } else {
              errors.push(error instanceof Error ? error.message : 'Could not save the document.')
              continue
            }
          }
        } else {
          memory.current.set(meta.id, { meta, blob: file })
        }
        added.push(meta)
      }
      await refresh()
      return { added, errors }
    },
    [persistent, refresh],
  )

  const getBlob = useCallback(
    async (id: string) => {
      const mem = memory.current.get(id)
      if (mem) return mem.blob
      if (!persistent) return null
      return getDocBlob(id)
    },
    [persistent],
  )

  const update = useCallback(
    async (id: string, patch: Partial<Omit<StoredDocMeta, 'id'>>) => {
      const mem = memory.current.get(id)
      if (mem) mem.meta = { ...mem.meta, ...patch }
      else if (persistent) await updateDoc(id, patch)
      await refresh()
    },
    [persistent, refresh],
  )

  const value = useMemo<DocumentsContextValue>(
    () => ({
      docs,
      loading,
      persistent,
      addFiles,
      getBlob,
      update,
      remove: async (id) => {
        memory.current.delete(id)
        if (persistent) await deleteDoc(id)
        await refresh()
      },
      rename: async (id, name) => {
        const clean = name.trim()
        if (!clean) return
        await update(id, { name: /\.pdf$/i.test(clean) ? clean : `${clean}.pdf` })
      },
      touch: async (id) => update(id, { openedAt: Date.now() }),
      clear: async () => {
        memory.current.clear()
        if (persistent) await clearDocs()
        await refresh()
      },
    }),
    [docs, loading, persistent, addFiles, getBlob, update, refresh],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDocuments() {
  const context = useContext(DocumentsContext)
  if (!context) throw new Error('useDocuments must be used inside DocumentsProvider')
  return context
}
