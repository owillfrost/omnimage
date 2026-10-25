import * as React from 'react'
import type { Artwork } from '../types/artwork'
import { getCatalogProvider } from '../providers/providerFactory'

/**
 * Fast in-place Fisher-Yates shuffle returning a new array reference
 * so every visit/load starts with a fresh, randomized artwork layout.
 */
export function shuffleArtworks(items: Artwork[]): Artwork[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

interface UseCatalogLoaderOptions {
  currentLibrary: string
  onInitialCenterView: () => void
}

/**
 * Loads, caches, and progressively upgrades catalog library items using ICatalogProvider.
 */
export function useCatalogLoader({
  currentLibrary,
  onInitialCenterView,
}: UseCatalogLoaderOptions) {
  const [allArtworks, setAllArtworks] = React.useState<Artwork[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = React.useState(true)
  const [isConnected, setIsConnected] = React.useState(false)

  // Client-side in-memory cache per library so switching back and forth is 0ms
  const libraryClientCacheRef = React.useRef<Record<string, Artwork[]>>({})

  const onInitialCenterViewRef = React.useRef(onInitialCenterView)
  React.useEffect(() => {
    onInitialCenterViewRef.current = onInitialCenterView
  }, [onInitialCenterView])

  const loadCatalog = React.useCallback(async (refresh = false) => {
    const cached = libraryClientCacheRef.current[currentLibrary]
    if (cached && cached.length > 0 && !refresh) {
      setAllArtworks(shuffleArtworks(cached))
      setIsConnected(true)
      onInitialCenterViewRef.current()
      setIsLoadingLibrary(false)
      return
    }

    setIsLoadingLibrary(true)

    try {
      const provider = getCatalogProvider()
      const items = await provider.fetchArtworks(currentLibrary, { limit: 50000, refresh })
      if (items.length > 0) {
        const shuffled = shuffleArtworks(items)
        libraryClientCacheRef.current[currentLibrary] = shuffled
        setAllArtworks(shuffled)
        setIsConnected(true)
        if (!cached || refresh) {
          onInitialCenterViewRef.current()
        }
      }
    } catch (err) {
      console.warn(`Could not load catalog items for (${currentLibrary}):`, err)
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [currentLibrary])

  React.useEffect(() => {
    void loadCatalog(false)
  }, [loadCatalog])

  const refreshCurrentLibrary = React.useCallback(async () => {
    delete libraryClientCacheRef.current[currentLibrary]
    await loadCatalog(true)
  }, [currentLibrary, loadCatalog])

  const shuffleCurrentArtworks = React.useCallback(() => {
    setAllArtworks((prev) => shuffleArtworks(prev))
  }, [])

  return {
    allArtworks,
    setAllArtworks,
    isLoadingLibrary,
    isEagleConnected: isConnected,
    refreshCurrentLibrary,
    shuffleCurrentArtworks,
  }
}
