import type { Artwork } from '../types/artwork'
import { getCatalogProvider } from '../providers/providerFactory'

export interface VisualQueryResult {
  status: 'success' | 'error'
  embedding?: number[] | Int8Array
  width?: number
  height?: number
  aspectRatio?: number
  dominantColor?: string
  palette?: string[]
  paletteWeights?: number[]
  error?: string
}

export interface PerformVisualQueryOptions {
  file?: File | Blob
  dataUrl?: string
  url?: string
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function queryVisualSearch(options: PerformVisualQueryOptions): Promise<{
  artwork: Artwork
  rawResult: VisualQueryResult
}> {
  let previewUrl = ''
  let queryTitle = 'Visual Search Query'

  if (options.file) {
    previewUrl = await fileToDataUrl(options.file)
    if ('name' in options.file && options.file.name) {
      queryTitle = options.file.name
    } else {
      queryTitle = 'Clipboard Image'
    }
  } else if (options.dataUrl) {
    previewUrl = options.dataUrl
    queryTitle = 'Pasted Visual Reference'
  } else if (options.url) {
    previewUrl = options.url
    try {
      const parsed = new URL(options.url)
      const pathname = parsed.pathname.split('/').pop()
      queryTitle = pathname || 'Web Image Query'
    } catch {
      queryTitle = 'Web Image Query'
    }
  } else {
    throw new Error('Nenhuma fonte de imagem fornecida.')
  }

  const provider = getCatalogProvider()
  const data = await provider.computeVisualQuery(options)

  const dominant = data.dominantColor || '#18181b'
  const aspect = data.aspectRatio || 1.0

  const ephemeralArtwork: Artwork = {
    id: `ephemeral-visual-${Date.now()}`,
    title: queryTitle,
    artist: 'Referência Visual Externa',
    date: 'Instantâneo',
    medium: `CLIP ViT-B/32 • ${data.width}x${data.height}`,
    source: 'Busca Visual por Imagem',
    sourceUrl: '#',
    imageUrl: previewUrl,
    thumbnailUrl: previewUrl,
    aspectRatio: aspect,
    dominantColor: dominant,
    palette: data.palette || [dominant],
    paletteWeights: data.paletteWeights,
    splitToning: data.splitToning,
    tags: ['visual-query', 'reverse-image-search'],
    embedding: data.embedding,
    isEphemeral: true,
    department: 'Inteligência Artificial',
    culture: `Âncora visual gerada a partir de ${queryTitle}`,
    worldX: 0,
    worldY: 0,
    width: 260,
    height: Math.round(260 / aspect),
  }

  return {
    artwork: ephemeralArtwork,
    rawResult: {
      status: 'success',
      embedding: Array.from(data.embedding),
      width: data.width,
      height: data.height,
      aspectRatio: data.aspectRatio,
      dominantColor: data.dominantColor,
      palette: data.palette,
      paletteWeights: data.paletteWeights,
    },
  }
}
