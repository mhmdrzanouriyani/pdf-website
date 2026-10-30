import { useEffect, useState } from 'react'
import { useDocuments } from '../state/DocumentsContext'
import { usePdfSource } from './usePdfSource'

/** File state for single-PDF tools, preloaded from the workspace when opened with ?doc=<id>. */
export function useSinglePdf(docIds: string[]) {
  const documents = useDocuments()
  const [file, setFile] = useState<File | null>(null)
  const { source, submitPassword } = usePdfSource(file)
  const preloadId = docIds[0]

  useEffect(() => {
    if (!preloadId) return
    let cancelled = false
    documents.getBlob(preloadId).then((blob) => {
      const meta = documents.docs.find((doc) => doc.id === preloadId)
      if (!cancelled && blob && meta) setFile(new File([blob], meta.name, { type: 'application/pdf' }))
    })
    return () => {
      cancelled = true
    }
    // Only when the requested id changes (docs list loads asynchronously)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadId, documents.loading])

  return { file, setFile, source, submitPassword }
}
