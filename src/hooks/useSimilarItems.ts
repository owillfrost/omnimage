import { useEffect, useState } from 'react'
import type { Artwork } from '../types/artwork'
import {
  getSimilarItemsWithMeta,
  type SimilaritySortMode,
} from '../services/similarityService'

/**
 * Computes aesthetically & visually similar items for the given artwork via the similarity Web Worker.
 * Waits briefly for the hero image to start loading so it gets network/CPU priority.
 */
export function useSimilarItems(
  artwork: Artwork | null,
  artworks: Artwork[],
  heroLoaded: boolean,
  mode: SimilaritySortMode = 'hybrid'
) {
  const [similarArtworks, setSimilarArtworks] = useState<Artwork[]>([])
  const [hasVisualEmbeddings, setHasVisualEmbeddings] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Mark loading immediately during render when artwork or mode changes (avoids cascading effect render)
  const [prevKey, setPrevKey] = useState<string | undefined>(
    artwork ? `${artwork.id}:${mode}` : undefined
  )
  const currentKey = artwork ? `${artwork.id}:${mode}` : undefined
  if (currentKey !== prevKey) {
    setPrevKey(currentKey)
    setIsLoading(true)
  }

  useEffect(() => {
    if (!artwork) return
    let isCancelled = false
    const delayMs = heroLoaded ? 0 : 180
    const timer = window.setTimeout(() => {
      getSimilarItemsWithMeta(artwork, artworks, { mode })
        .then(res => {
          if (!isCancelled) {
            setSimilarArtworks(res.items)
            setHasVisualEmbeddings(res.hasVisualEmbeddings)
            setIsLoading(false)
          }
        })
        .catch(() => {
          if (!isCancelled) setIsLoading(false)
        })
    }, delayMs)

    return () => {
      isCancelled = true
      window.clearTimeout(timer)
    }
  }, [artwork, heroLoaded, artworks, mode])

  return { similarArtworks, hasVisualEmbeddings, isLoading }
}

