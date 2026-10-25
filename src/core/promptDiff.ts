/**
 * Tokenizes and diffs prompts and tags between two artworks for comparative reference analysis.
 */

export interface TokenSpan {
  text: string
  type: 'shared' | 'unique'
}

export interface PromptDiffResult {
  hasPrompts: boolean
  promptA: string
  promptB: string
  spansA: TokenSpan[]
  spansB: TokenSpan[]
  sharedTerms: string[]
  uniqueTermsA: string[]
  uniqueTermsB: string[]
  similarityRatio: number // 0 to 1
}

export interface TagDiffResult {
  sharedTags: string[]
  onlyATags: string[]
  onlyBTags: string[]
  overlapPercentage: number // 0 to 100
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'it', 'this', 'that', 'as', 'be',
  'o', 'a', 'os', 'as', 'um', 'uma', 'e', 'ou', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
  'nos', 'nas', 'por', 'com', 'para', 'como', 'que', 'se', 'ao', 'aos',
])

function cleanToken(token: string): string {
  return token.toLowerCase().replace(/^[^\w\d]+|[^\w\d]+$/g, '').trim()
}

/**
 * Computes a fine-grained word/token diff between two prompt strings.
 */
export function diffPrompts(promptA = '', promptB = ''): PromptDiffResult {
  const cleanA = promptA.trim()
  const cleanB = promptB.trim()

  const hasPrompts = !!(cleanA && cleanA !== 'Local Asset') || !!(cleanB && cleanB !== 'Local Asset')

  if (!hasPrompts) {
    return {
      hasPrompts: false,
      promptA: cleanA,
      promptB: cleanB,
      spansA: [{ text: cleanA, type: 'unique' }],
      spansB: [{ text: cleanB, type: 'unique' }],
      sharedTerms: [],
      uniqueTermsA: [],
      uniqueTermsB: [],
      similarityRatio: 0,
    }
  }

  // Split keeping punctuation/whitespace delimiters
  const tokensA = cleanA.split(/(\s+|[,;:.!?()[\]"']+)/).filter(Boolean)
  const tokensB = cleanB.split(/(\s+|[,;:.!?()[\]"']+)/).filter(Boolean)

  const normalizedTokensA = new Set(
    tokensA
      .map(cleanToken)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  )

  const normalizedTokensB = new Set(
    tokensB
      .map(cleanToken)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  )

  const sharedSet = new Set<string>()
  for (const t of normalizedTokensA) {
    if (normalizedTokensB.has(t)) {
      sharedSet.add(t)
    }
  }

  const spansA: TokenSpan[] = tokensA.map(tok => {
    const norm = cleanToken(tok)
    if (norm.length > 2 && sharedSet.has(norm)) {
      return { text: tok, type: 'shared' }
    }
    return { text: tok, type: 'unique' }
  })

  const spansB: TokenSpan[] = tokensB.map(tok => {
    const norm = cleanToken(tok)
    if (norm.length > 2 && sharedSet.has(norm)) {
      return { text: tok, type: 'shared' }
    }
    return { text: tok, type: 'unique' }
  })

  const sharedTerms = Array.from(sharedSet).sort()
  const uniqueTermsA = Array.from(normalizedTokensA).filter(t => !sharedSet.has(t)).sort()
  const uniqueTermsB = Array.from(normalizedTokensB).filter(t => !sharedSet.has(t)).sort()

  const totalTerms = new Set([...normalizedTokensA, ...normalizedTokensB]).size
  const similarityRatio = totalTerms > 0 ? sharedTerms.length / totalTerms : 0

  return {
    hasPrompts,
    promptA: cleanA,
    promptB: cleanB,
    spansA,
    spansB,
    sharedTerms,
    uniqueTermsA,
    uniqueTermsB,
    similarityRatio,
  }
}

/**
 * Extracts normalized tag arrays from artwork.artist or artwork.tags.
 */
export function extractTags(tagsList?: string[] | string): string[] {
  if (!tagsList) return []
  if (Array.isArray(tagsList)) {
    return Array.from(new Set(tagsList.map(t => t.trim().replace(/^#/, '')).filter(Boolean)))
  }
  return Array.from(
    new Set(
      tagsList
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean)
    )
  )
}

/**
 * Computes tag intersection and differences between two tag lists.
 */
export function diffTags(rawTagsA?: string[] | string, rawTagsB?: string[] | string): TagDiffResult {
  const tagsA = extractTags(rawTagsA)
  const tagsB = extractTags(rawTagsB)

  const mapB = new Map<string, string>()
  tagsB.forEach(t => mapB.set(t.toLowerCase(), t))

  const sharedTags: string[] = []
  const onlyATags: string[] = []

  for (const tag of tagsA) {
    const lower = tag.toLowerCase()
    if (mapB.has(lower)) {
      sharedTags.push(tag)
    } else {
      onlyATags.push(tag)
    }
  }

  const mapA = new Set(tagsA.map(t => t.toLowerCase()))
  const onlyBTags: string[] = []
  for (const tag of tagsB) {
    if (!mapA.has(tag.toLowerCase())) {
      onlyBTags.push(tag)
    }
  }

  const unionSize = new Set([...tagsA.map(t => t.toLowerCase()), ...tagsB.map(t => t.toLowerCase())]).size
  const overlapPercentage = unionSize > 0 ? Math.round((sharedTags.length / unionSize) * 100) : 0

  return {
    sharedTags,
    onlyATags,
    onlyBTags,
    overlapPercentage,
  }
}
