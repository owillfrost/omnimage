export interface LibrarySource {
  id: string
  name: string
  path: string
  sourceFolderPath?: string
  type: 'native-folder' | 'eagle-library'
  itemCount: number
  indexedEmbeddingCount: number
  hidden?: boolean
}

export interface CompactCatalogItem {
  id: string
  name: string
  ext: string
  width?: number
  height?: number
  duration?: number
  btime?: number
  tags?: string[]
  folders?: string[]
  url?: string
  hasAnnotation?: boolean
  annotationPreview?: string
  palettes?: Array<{ color: [number, number, number]; ratio: number }>
}

export interface ComfyMetadata {
  hasWorkflow: boolean
  workflowJson?: string
  promptApiJson?: string
  positivePrompt?: string
  negativePrompt?: string
  model?: string
  seed?: string | number
  steps?: number
  cfg?: number
  sampler?: string
  scheduler?: string
  loras?: string[]
}

export interface CatalogItemDetail extends CompactCatalogItem {
  annotation?: string
  filePath?: string
  contentHash?: string
  updatedAt?: string
  comfy?: ComfyMetadata
}

export interface CatalogFolderNode {
  id: string
  name: string
  description?: string
  iconColor?: string
  itemCount: number
  directCount: number
  allFolderIds: string[]
  children: CatalogFolderNode[]
}

export interface CatalogTagFacet {
  name: string
  count: number
}

export interface CatalogTagGroup {
  id: string
  name: string
  tags: string[]
  description?: string
}

export interface CatalogTaxonomyResponse {
  status: 'success'
  library: string
  folders: CatalogFolderNode[]
  tags: CatalogTagFacet[]
  tagsGroups: CatalogTagGroup[]
  folderNameMap: Record<string, string>
  totalCount: number
}

export interface ItemMetadataPatch {
  name?: string
  tags?: string[]
  folders?: string[]
  annotation?: string
  url?: string
}
