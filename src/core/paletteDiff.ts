import type { Artwork } from '../types/artwork'
import { calculateColorDistance } from './colorClustering'

export interface ColorMatchPair {
  colorA: string
  colorB: string
  distance: number
}

export interface PaletteDiffResult {
  dominantA: string
  dominantB: string
  dominantDistance: number
  harmonyScore: number // 0-100
  harmonyLabel: string
  paletteA: string[]
  paletteB: string[]
  closestPairs: ColorMatchPair[]
}

export function diffPalettes(artworkA: Artwork, artworkB: Artwork): PaletteDiffResult {
  const dominantA = artworkA.dominantColor || '#18181b'
  const dominantB = artworkB.dominantColor || '#18181b'

  const paletteA = Array.from(new Set([dominantA, ...(artworkA.palette || [])].filter(Boolean)))
  const paletteB = Array.from(new Set([dominantB, ...(artworkB.palette || [])].filter(Boolean)))

  const dominantDistance = calculateColorDistance(dominantA, dominantB)

  // Calibrate harmony score: deltaE ~ 0 -> 100%, deltaE ~ 35 -> 60%, deltaE >= 85 -> 0%
  const harmonyScore = Math.max(0, Math.min(100, Math.round(100 - (dominantDistance / 75) * 100)))

  let harmonyLabel = 'Alto Contraste'
  if (dominantDistance < 8) {
    harmonyLabel = 'Idêntica / Monocromática'
  } else if (dominantDistance < 22) {
    harmonyLabel = 'Alta Afinidade Harmônica'
  } else if (dominantDistance < 42) {
    harmonyLabel = 'Harmonia Balanceada'
  } else if (dominantDistance < 65) {
    harmonyLabel = 'Contraste Moderado'
  }

  // Find closest pairs from A to B
  const closestPairs: ColorMatchPair[] = paletteA.map(colorA => {
    let bestColor = paletteB[0] || dominantB
    let minDistance = Infinity
    for (const colorB of paletteB) {
      const d = calculateColorDistance(colorA, colorB)
      if (d < minDistance) {
        minDistance = d
        bestColor = colorB
      }
    }
    return {
      colorA,
      colorB: bestColor,
      distance: Math.round(minDistance * 10) / 10,
    }
  })

  return {
    dominantA,
    dominantB,
    dominantDistance: Math.round(dominantDistance * 10) / 10,
    harmonyScore,
    harmonyLabel,
    paletteA,
    paletteB,
    closestPairs,
  }
}
