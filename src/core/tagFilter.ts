/**
 * Tag Facets and Operator Parser for Omnimage
 *
 * Supports:
 * - `#tag` or `+#tag` -> Inclusive tag filter (item must have this tag)
 * - `-tag` or `-#tag` -> Exclusive tag filter (item must NOT have this tag)
 * - Free text -> Searched in item title, artist, annotation, etc.
 * - Handles quotes: e.g. `#"Text Overlay"` or `-"Social Media"`
 */

export interface ParsedSearchQuery {
  rawQuery: string
  cleanText: string
  includedTags: string[]
  excludedTags: string[]
}

/**
 * Tokenizes a query string while respecting quoted phrases like `#"Design Tips"` or `-"Muted Colors"`.
 */
export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = []
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(query)) !== null) {
    // Quoted token or bare word
    const token = match[1] ?? match[2] ?? match[0]
    if (token) {
      tokens.push(token)
    }
  }

  return tokens
}

/**
 * Parses user input into inclusive tags, exclusive tags, and remaining free text.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const rawQuery = query || ''
  if (!rawQuery.trim()) {
    return {
      rawQuery: '',
      cleanText: '',
      includedTags: [],
      excludedTags: [],
    }
  }

  const tokens = tokenizeQuery(rawQuery)
  const includedTags: string[] = []
  const excludedTags: string[] = []
  const textWords: string[] = []

  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue

    // Exclusion operator: -#tag or -tag
    if (trimmed.startsWith('-#') && trimmed.length > 2) {
      const tag = trimmed.slice(2).trim()
      if (tag && !excludedTags.includes(tag)) excludedTags.push(tag)
    } else if (trimmed.startsWith('-') && trimmed.length > 1) {
      const tag = trimmed.slice(1).trim()
      if (tag && !excludedTags.includes(tag)) excludedTags.push(tag)
    }
    // Inclusion operator: +#tag, #tag
    else if (trimmed.startsWith('+#') && trimmed.length > 2) {
      const tag = trimmed.slice(2).trim()
      if (tag && !includedTags.includes(tag)) includedTags.push(tag)
    } else if (trimmed.startsWith('#') && trimmed.length > 1) {
      const tag = trimmed.slice(1).trim()
      if (tag && !includedTags.includes(tag)) includedTags.push(tag)
    } else {
      textWords.push(trimmed)
    }
  }

  return {
    rawQuery,
    cleanText: textWords.join(' '),
    includedTags,
    excludedTags,
  }
}

/**
 * Checks if artwork tags satisfy the included and excluded tag facets.
 * - Included tags use AND logic: item must possess every included tag.
 * - Excluded tags use OR logic: item possessing ANY excluded tag is rejected.
 */
export function matchesTagFilters(
  artworkTags: string[] | undefined,
  includedTags: string[],
  excludedTags: string[]
): boolean {
  if (includedTags.length === 0 && excludedTags.length === 0) {
    return true
  }

  const normalizedItemTags = new Set(
    (artworkTags || []).map((t) => t.trim().toLowerCase())
  )

  // 1. Exclusion check (fast rejection)
  for (let i = 0; i < excludedTags.length; i++) {
    const ex = excludedTags[i].trim().toLowerCase()
    if (normalizedItemTags.has(ex)) {
      return false
    }
  }

  // 2. Inclusion check (conjunction AND)
  for (let i = 0; i < includedTags.length; i++) {
    const inc = includedTags[i].trim().toLowerCase()
    if (!normalizedItemTags.has(inc)) {
      return false
    }
  }

  return true
}

/**
 * Toggles or appends a tag in the query string.
 */
export function toggleTagInQuery(
  currentQuery: string,
  tag: string,
  action: 'include' | 'exclude' | 'remove'
): string {
  const parsed = parseSearchQuery(currentQuery)
  const normTag = tag.trim().toLowerCase()

  let newIncluded = parsed.includedTags.filter((t) => t.toLowerCase() !== normTag)
  let newExcluded = parsed.excludedTags.filter((t) => t.toLowerCase() !== normTag)

  if (action === 'include') {
    newIncluded.push(tag.trim())
  } else if (action === 'exclude') {
    newExcluded.push(tag.trim())
  }

  const parts: string[] = []
  if (parsed.cleanText) {
    parts.push(parsed.cleanText)
  }

  for (const t of newIncluded) {
    const format = t.includes(' ') ? `#"${t}"` : `#${t}`
    parts.push(format)
  }

  for (const t of newExcluded) {
    const format = t.includes(' ') ? `-"${t}"` : `-${t}`
    parts.push(format)
  }

  return parts.join(' ')
}

/**
 * Safely removes a tag from the query string.
 */
export function removeTagFromQuery(currentQuery: string, tag: string): string {
  return toggleTagInQuery(currentQuery, tag, 'remove')
}
