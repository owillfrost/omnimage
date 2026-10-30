import type { Artwork } from '../types/artwork'
import { getCatalogProvider } from '../providers/providerFactory'

export interface SemanticQueryResult {
  status: 'success' | 'error'
  query?: string
  embedding?: number[] | Int8Array
  dim?: number
  error?: string
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapText(text: string, maxCharsPerLine = 22): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + word).trim()
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4)
}

export function createSemanticQueryPreview(query: string): string {
  const lines = wrapText(query, 24).map(escapeXml)
  const startY = Math.round(256 - ((lines.length - 1) * 36) / 2)

  const lineElements = lines
    .map(
      (line, i) =>
        `<tspan x="256" dy="${i === 0 ? 0 : 36}">${line}</tspan>`
    )
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#09090b" />
  <rect x="20" y="20" width="472" height="472" rx="20" fill="#121215" stroke="#27272a" stroke-width="1.5" />

  <text x="256" y="74" text-anchor="middle" fill="#71717a" font-family="'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" letter-spacing="1.5">BUSCA TEXTUAL</text>
  <line x1="64" y1="96" x2="448" y2="96" stroke="#222226" stroke-width="1" />

  <text x="256" y="${startY}" text-anchor="middle" fill="#f4f4f6" font-family="'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" letter-spacing="-0.3">
    ${lineElements}
  </text>

  <line x1="64" y1="416" x2="448" y2="416" stroke="#222226" stroke-width="1" />
  <text x="256" y="446" text-anchor="middle" fill="#52525b" font-family="'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="500">Similaridade Semântica Neural</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export async function querySemanticSearch(query: string): Promise<{
  artwork: Artwork
  rawResult: SemanticQueryResult
}> {
  const trimmed = query.trim()
  if (!trimmed) {
    throw new Error('Texto da busca semântica não pode estar vazio.')
  }

  const provider = getCatalogProvider()
  const { embedding, dim } = await provider.computeTextEmbedding(trimmed)

  const previewUrl = createSemanticQueryPreview(trimmed)
  const dominant = '#27272a'

  const ephemeralArtwork: Artwork = {
    id: `ephemeral-text-${Date.now()}`,
    title: trimmed,
    artist: 'Busca Semântica por Texto',
    date: 'Instantâneo',
    medium: 'Vetor Zero-Shot 512D',
    source: 'Busca Semântica',
    sourceUrl: '#',
    imageUrl: previewUrl,
    thumbnailUrl: previewUrl,
    aspectRatio: 1.0,
    dominantColor: dominant,
    palette: [dominant, '#18181c', '#09090b', '#3f3f46', '#52525b'],
    paletteWeights: [0.35, 0.25, 0.20, 0.10, 0.10],
    tags: ['clip-text-query', 'zero-shot', 'ai-search'],
    embedding,
    isEphemeral: true,
    isTextQuery: true,
    department: 'Busca Semântica',
    culture: `Prompt de Busca: "${trimmed}"`,
    worldX: 0,
    worldY: 0,
    width: 260,
    height: 260,
  }

  return {
    artwork: ephemeralArtwork,
    rawResult: {
      status: 'success',
      query: trimmed,
      embedding: Array.from(embedding),
      dim,
    },
  }
}
