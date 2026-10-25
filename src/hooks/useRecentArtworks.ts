import * as React from 'react'
import type { Artwork } from '../types/artwork'

/**
 * Manages the FIFO visual history trail (max `limit` items, deduplicated).
 */
export function useRecentArtworks(limit = 5) {
  const [recentlyViewed, setRecentlyViewed] = React.useState<Artwork[]>([])

  const addToRecentlyViewed = React.useCallback(
    (artwork: Artwork) => {
      setRecentlyViewed((prev) => {
        const withoutDuplicate = prev.filter((item) => item.id !== artwork.id)
        const next = [...withoutDuplicate, artwork]
        return next.length > limit ? next.slice(next.length - limit) : next
      })
    },
    [limit]
  )

  return {
    recentlyViewed,
    addToRecentlyViewed,
  }
}
