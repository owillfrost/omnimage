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

  const lineElements = lines
    .map(
      (line, i) =>
        `<tspan x="256" dy="${i === 0 ? 0 : 36}" text-anchor="middle">${line}</tspan>`
    )
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="aura" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#2e1065" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#09090b" stop-opacity="1" />
    </radialGradient>
    <linearGradient id="cardBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8" stop-opacity="0.5" />
      <stop offset="50%" stop-color="#312e81" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#18181b" stop-opacity="0.8" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="14" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <rect width="512" height="512" fill="#09090b" />
  <rect width="512" height="512" fill="url(#aura)" />
  <rect x="16" y="16" width="480" height="480" rx="24" fill="none" stroke="url(#cardBorder)" stroke-width="2" />

  <g transform="translate(256, 68)">
    <rect x="-115" y="-16" width="230" height="32" rx="16" fill="#18181b" stroke="#4338ca" stroke-width="1.2" opacity="0.9" />
    <text x="0" y="4" text-anchor="middle" fill="#a5b4fc" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="11" font-weight="600" letter-spacing="1.5">✦ BUSCA SEMÂNTICA IA</text>
  </g>

  <text x="256" y="185" text-anchor="middle" fill="#6366f1" opacity="0.3" font-family="Georgia, serif" font-size="96" font-weight="bold">“</text>

  <text x="256" y="245" fill="#f8fafc" font-family="'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="-0.5" filter="url(#glow)">
    ${lineElements}
  </text>

  <g transform="translate(256, 440)">
    <text x="0" y="0" text-anchor="middle" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="10.5" letter-spacing="1">CLIP ViT-B/32 • 512D INT8 • ZERO-SHOT</text>
    <text x="0" y="22" text-anchor="middle" fill="#64748b" font-family="'Satoshi', -apple-system, BlinkMacSystemFont, sans-serif" font-size="10">Epicentro de similaridade radial (0, 0)</text>
  </g>
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
  const dominant = '#6366f1'

  const ephemeralArtwork: Artwork = {
    id: `ephemeral-text-${Date.now()}`,
    title: trimmed,
    artist: 'CLIP Natural Text Query',
    date: 'Instantâneo',
    medium: 'Vetor Zero-Shot 512D',
    source: 'Busca Semântica',
    sourceUrl: '#',
    imageUrl: previewUrl,
    thumbnailUrl: previewUrl,
    aspectRatio: 1.0,
    dominantColor: dominant,
    palette: [dominant, '#2e1065', '#09090b', '#818cf8', '#f8fafc'],
    paletteWeights: [0.45, 0.25, 0.15, 0.10, 0.05],
    tags: ['clip-text-query', 'zero-shot', 'ai-search'],
    embedding,
    isEphemeral: true,
    isTextQuery: true,
    department: 'Inteligência Artificial',
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
