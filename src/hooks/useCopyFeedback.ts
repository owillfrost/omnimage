import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Temporary "done" feedback state (e.g. "Copiado!") that auto-resets after `durationMs`.
 * Generic over the value so it can track which item was copied (e.g. a HEX code).
 */
export function useTransientValue<T>(durationMs: number) {
  const [value, setValue] = useState<T | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const flash = useCallback(
    (next: T) => {
      window.clearTimeout(timerRef.current)
      setValue(next)
      timerRef.current = window.setTimeout(() => setValue(null), durationMs)
    },
    [durationMs]
  )

  return [value, flash, setValue] as const
}
