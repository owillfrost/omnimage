import { useState, useEffect } from 'react'
import type { Artwork } from '../types/artwork'
import type { CatalogItemDetail } from '../contracts/schemas'
import { getCatalogProvider } from '../providers/providerFactory'

const itemDetailCache = new Map<string, CatalogItemDetail>()
const inflightRequests = new Map<string, Promise<CatalogItemDetail | null>>()

export function resolveArtworkLibAndId(artwork: Artwork): { lib: string; rawId: string; isCatalogItem: boolean } {
  if (artwork.libraryId && artwork.rawId) {
    return { lib: artwork.libraryId, rawId: artwork.rawId, isCatalogItem: true }
  }
  const id = artwork.id
  if (id.startsWith('google-flow-')) {
    return { isCatalogItem: true, lib: 'google-flow', rawId: id.slice('google-flow-'.length) }
  }
  if (id.startsWith('design-')) {
    return { isCatalogItem: true, lib: 'design', rawId: id.slice('design-'.length) }
  }
  const dashIdx = id.indexOf('-')
  if (dashIdx > 0) {
    return { isCatalogItem: true, lib: id.slice(0, dashIdx), rawId: id.slice(dashIdx + 1) }
  }
  return { isCatalogItem: false, lib: 'design', rawId: id }
}

export function isPngArtwork(artwork: Artwork | null | undefined): boolean {
  if (!artwork || artwork.isTextQuery || artwork.isEphemeral) return false
  if (artwork.ext && artwork.ext.toLowerCase() === 'png') return true
  if (artwork.medium && artwork.medium.toUpperCase().startsWith('PNG')) return true
  return false
}

export function useItemDetail(artwork: Artwork | null | undefined): {
  detail: CatalogItemDetail | null
  isLoading: boolean
} {
  const [detail, setDetail] = useState<CatalogItemDetail | null>(() => {
    if (!artwork) return null
    return itemDetailCache.get(artwork.id) ?? null
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!artwork || artwork.isTextQuery || artwork.isEphemeral) {
      setDetail(null)
      setIsLoading(false)
      return
    }

    const cached = itemDetailCache.get(artwork.id)
    if (cached) {
      setDetail(cached)
      setIsLoading(false)
      return
    }

    const shouldFetch =
      isPngArtwork(artwork) ||
      (artwork.hasAnnotation && (!artwork.annotation || artwork.annotation.length < 10))

    if (!shouldFetch) {
      setDetail(null)
      setIsLoading(false)
      return
    }

    let active = true
    setIsLoading(true)

    const { lib, rawId } = resolveArtworkLibAndId(artwork)
    let req = inflightRequests.get(artwork.id)
    if (!req) {
      req = getCatalogProvider()
        .fetchItemDetail(lib, rawId)
        .then(res => {
          if (res) {
            itemDetailCache.set(artwork.id, res)
          }
          inflightRequests.delete(artwork.id)
          return res
        })
        .catch(() => {
          inflightRequests.delete(artwork.id)
          return null
        })
      inflightRequests.set(artwork.id, req)
    }

    req.then(res => {
      if (!active) return
      setDetail(res)
      setIsLoading(false)
    })

    return () => {
      active = false
    }
  }, [artwork])

  return { detail, isLoading }
}
