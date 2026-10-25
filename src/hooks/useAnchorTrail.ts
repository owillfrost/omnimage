import * as React from "react"
import type { Artwork } from "../types/artwork"

export interface UseAnchorTrailOptions {
  maxTrail?: number
}

export interface UseAnchorTrailReturn {
  trail: Artwork[]
  currentIndex: number
  currentAnchor: Artwork | null
  canGoBack: boolean
  canGoForward: boolean
  pushAnchor: (artwork: Artwork) => void
  goToIndex: (index: number) => Artwork | null
  goBack: () => Artwork | null
  goForward: () => Artwork | null
  clearTrail: () => void
}

/**
 * Hook to manage the radial anchor history trail (Rabbit Hole navigation).
 * Supports forward/backward navigation and branch truncation on new selections.
 */
export function useAnchorTrail({ maxTrail = 20 }: UseAnchorTrailOptions = {}): UseAnchorTrailReturn {
  const [trail, setTrail] = React.useState<Artwork[]>([])
  const [currentIndex, setCurrentIndex] = React.useState<number>(-1)

  const pushAnchor = React.useCallback(
    (artwork: Artwork) => {
      setTrail((prevTrail) => {
        // If current anchor is already the requested one, avoid duplicate
        if (currentIndex >= 0 && currentIndex < prevTrail.length && prevTrail[currentIndex].id === artwork.id) {
          return prevTrail
        }

        // Branch truncation: if we are in the middle of history, discard the forward entries
        const baseTrail = currentIndex >= 0 ? prevTrail.slice(0, currentIndex + 1) : []
        const newTrail = [...baseTrail, artwork]

        // Enforce maximum trail length to prevent memory leakage
        if (newTrail.length > maxTrail) {
          const trimmed = newTrail.slice(newTrail.length - maxTrail)
          setCurrentIndex(trimmed.length - 1)
          return trimmed
        }

        setCurrentIndex(newTrail.length - 1)
        return newTrail
      })
    },
    [currentIndex, maxTrail]
  )

  const goToIndex = React.useCallback(
    (index: number): Artwork | null => {
      if (index >= 0 && index < trail.length) {
        setCurrentIndex(index)
        return trail[index]
      }
      return null
    },
    [trail]
  )

  const goBack = React.useCallback((): Artwork | null => {
    if (currentIndex > 0) {
      const nextIndex = currentIndex - 1
      setCurrentIndex(nextIndex)
      return trail[nextIndex]
    }
    return null
  }, [currentIndex, trail])

  const goForward = React.useCallback((): Artwork | null => {
    if (currentIndex >= 0 && currentIndex < trail.length - 1) {
      const nextIndex = currentIndex + 1
      setCurrentIndex(nextIndex)
      return trail[nextIndex]
    }
    return null
  }, [currentIndex, trail])

  const clearTrail = React.useCallback(() => {
    setTrail([])
    setCurrentIndex(-1)
  }, [])

  const currentAnchor = currentIndex >= 0 && currentIndex < trail.length ? trail[currentIndex] : null
  const canGoBack = currentIndex > 0
  const canGoForward = currentIndex >= 0 && currentIndex < trail.length - 1

  return {
    trail,
    currentIndex,
    currentAnchor,
    canGoBack,
    canGoForward,
    pushAnchor,
    goToIndex,
    goBack,
    goForward,
    clearTrail,
  }
}
