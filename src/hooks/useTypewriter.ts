import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './useMediaQuery'

export function useTypewriter(text: string, enabled = true, speed = 14) {
  const reduceMotion = usePrefersReducedMotion()
  const [output, setOutput] = useState(enabled && reduceMotion ? text : '')
  const [done, setDone] = useState(enabled && reduceMotion)

  useEffect(() => {
    if (!enabled) {
      setOutput('')
      setDone(false)
      return
    }

    if (reduceMotion) {
      setOutput(text)
      setDone(true)
      return
    }

    setOutput('')
    setDone(false)
    let index = 0
    const id = window.setInterval(() => {
      index += 1
      setOutput(text.slice(0, index))
      if (index >= text.length) {
        window.clearInterval(id)
        setDone(true)
      }
    }, speed)

    return () => window.clearInterval(id)
  }, [text, enabled, speed, reduceMotion])

  return { output, done }
}
