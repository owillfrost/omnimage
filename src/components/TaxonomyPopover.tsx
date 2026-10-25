import * as React from "react"
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  X,
  Tag,
  Plus,
  Minus,
  SlidersHorizontal,
  Film,
  Image as ImageIcon,
  LayoutGrid,
} from "lucide-react"
import type { CatalogFolderNode as EagleFolder, CatalogTagFacet as EagleTagFacet, CatalogTagGroup as EagleTagGroup } from "../contracts/schemas"
import type { MediaTypeFilter } from "../core/mediaUtils"
import { parseSearchQuery, toggleTagInQuery } from "../core/tagFilter"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { cn } from "@/lib/utils"

export type TaxonomyTab = 'folders' | 'tags' | 'media'

export interface EagleTaxonomyPopoverProps {
  folders: EagleFolder[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  tags: EagleTagFacet[]
  tagsGroups?: EagleTagGroup[]
  searchQuery: string
  onSearchQueryChange: (newQuery: string) => void
  totalCount: number
  libraryLabel?: string
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  activeTab?: TaxonomyTab
  onActiveTabChange?: (tab: TaxonomyTab) => void
  mediaTypeFilter?: MediaTypeFilter
  onMediaTypeFilterChange?: (filter: MediaTypeFilter) => void
  videoCount?: number
  imageCount?: number
}

interface FolderTreeItemProps {
  folder: EagleFolder
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  depth?: number
  searchFilter?: string
}

const FolderTreeItem: React.FC<FolderTreeItemProps> = ({
  folder,
  selectedFolderId,
  onSelectFolder,
  depth = 0,
  searchFilter = "",
}) => {
  const [isExpanded, setIsExpanded] = React.useState<boolean>(true)
  const isSelected = selectedFolderId === folder.id
  const hasChildren = folder.children && folder.children.length > 0

  const matchesSearch =
    !searchFilter ||
    folder.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    folder.children?.some((c) => c.name.toLowerCase().includes(searchFilter.toLowerCase()))

  if (!matchesSearch) {
    return null
  }

  const customColor = folder.iconColor
    ? folder.iconColor.startsWith('#')
      ? folder.iconColor
      : folder.iconColor === 'green'
      ? '#22c55e'
      : folder.iconColor === 'blue'
      ? '#3b82f6'
      : folder.iconColor === 'yellow'
      ? '#eab308'
      : folder.iconColor === 'red'
      ? '#ef4444'
      : folder.iconColor === 'purple'
      ? '#a855f7'
      : undefined
    : undefined

  return (
    <div className="flex flex-col select-none">
      <div
        className={cn(
          "flex items-center justify-between group px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer",
          isSelected
            ? "bg-amber-500/15 text-amber-200 border border-amber-500/30 font-medium"
            : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
        )}
        style={{ paddingLeft: `${Math.max(8, depth * 16 + 8)}px` }}
        onClick={() => onSelectFolder(folder.id)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded((prev) => !prev)
              }}
              className="p-0.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          {isSelected ? (
            <FolderOpen
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: customColor || '#f59e0b' }}
            />
          ) : (
            <Folder
              className="w-3.5 h-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-300"
              style={{ color: customColor }}
            />
          )}

          <span className="truncate text-xs">{folder.name}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded-full transition-colors",
              isSelected
                ? "bg-amber-500/25 text-amber-300"
                : "bg-zinc-900 text-zinc-500 group-hover:text-zinc-400 border border-zinc-800"
            )}
          >
            {folder.itemCount.toLocaleString()}
          </span>

          {isSelected && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              depth={depth + 1}
              searchFilter={searchFilter}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const EagleTaxonomyPopover: React.FC<EagleTaxonomyPopoverProps> = React.memo(({
  folders = [],
  selectedFolderId,
  onSelectFolder,
  tags = [],
  tagsGroups = [],
  searchQuery,
  onSearchQueryChange,
  totalCount,
  libraryLabel = "Eagle",
  disabled = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  activeTab: controlledTab,
  onActiveTabChange: setControlledTab,
  mediaTypeFilter = 'all',
  onMediaTypeFilterChange,
  videoCount = 0,
  imageCount = 0,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [internalTab, setInternalTab] = React.useState<TaxonomyTab>('folders')
  const [filterText, setFilterText] = React.useState("")
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = setControlledOpen || setInternalOpen

  const currentTab = controlledTab !== undefined ? controlledTab : internalTab
  const setCurrentTab = React.useCallback(
    (tab: TaxonomyTab) => {
      if (setControlledTab) {
        setControlledTab(tab)
      } else {
        setInternalTab(tab)
      }
      setFilterText("")
    },
    [setControlledTab]
  )

  const parsed = React.useMemo(() => parseSearchQuery(searchQuery), [searchQuery])

  // Build reverse map from tag name (lowercase) -> group name
  const tagToGroupMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const group of tagsGroups) {
      if (Array.isArray(group.tags)) {
        for (const t of group.tags) {
          const cleanGroupName = group.name.replace(/^[^\w\s\d]+|\d+\.\s*/g, '').trim() || group.name
          map.set(t.toLowerCase(), cleanGroupName)
        }
      }
    }
    return map
  }, [tagsGroups])

  const filteredTags = React.useMemo(() => {
    let result = tags
    const q = filterText.trim().toLowerCase()

    if (selectedGroupId) {
      const activeGroup = tagsGroups.find((g) => g.id === selectedGroupId)
      if (activeGroup) {
        const groupTagSet = new Set(activeGroup.tags.map((t) => t.toLowerCase()))
        result = result.filter((t) => groupTagSet.has(t.name.toLowerCase()))
      }
    }

    if (q) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          tagToGroupMap.get(t.name.toLowerCase())?.toLowerCase().includes(q)
      )
    }

    return result.slice(0, 100)
  }, [tags, tagsGroups, selectedGroupId, filterText, tagToGroupMap])

  const handleIncludeTag = React.useCallback(
    (tag: string) => {
      const isAlreadyIncluded = parsed.includedTags.some(
        (t) => t.toLowerCase() === tag.toLowerCase()
      )
      if (isAlreadyIncluded) {
        onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'remove'))
      } else {
        onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'include'))
      }
    },
    [parsed.includedTags, searchQuery, onSearchQueryChange]
  )

  const handleExcludeTag = React.useCallback(
    (tag: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const isAlreadyExcluded = parsed.excludedTags.some(
        (t) => t.toLowerCase() === tag.toLowerCase()
      )
      if (isAlreadyExcluded) {
        onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'remove'))
      } else {
        onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'exclude'))
      }
    },
    [parsed.excludedTags, searchQuery, onSearchQueryChange]
  )

  const handleSelectFolder = React.useCallback(
    (folderId: string | null) => {
      onSelectFolder(folderId)
      setIsOpen(false)
    },
    [onSelectFolder, setIsOpen]
  )

  const isMediaFiltered = mediaTypeFilter !== undefined && mediaTypeFilter !== 'all'
  const totalActiveTags = parsed.includedTags.length + parsed.excludedTags.length
  const totalActiveFilters = (selectedFolderId ? 1 : 0) + totalActiveTags + (isMediaFiltered ? 1 : 0)

  return (
    <TooltipProvider>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "p-2 rounded-full hover:bg-zinc-800/60 active:scale-95 transition-all select-none cursor-pointer shrink-0 relative",
                  totalActiveFilters > 0
                    ? "text-white bg-zinc-800 hover:bg-zinc-700"
                    : "text-zinc-400 hover:text-zinc-100"
                )}
                aria-label="Filtrar por Pastas, Smart Tags e Tipo de Mídia"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {totalActiveFilters > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-bold flex items-center justify-center leading-none shadow">
                    {totalActiveFilters}
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {totalActiveFilters > 0
              ? `Filtros ativos (${selectedFolderId ? "1 pasta, " : ""}${totalActiveTags ? `${totalActiveTags} tags, ` : ""}${isMediaFiltered ? (mediaTypeFilter === 'video' ? 'apenas vídeos' : 'apenas imagens') : ''})`
              : "Pastas, Smart Tags e Mídia"}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-88 sm:w-[420px] p-3 bg-zinc-950/95 border-zinc-800 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] rounded-2xl select-none"
        >
          {/* Segmented Control: Pastas | Smart Tags | Mídia */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div
              className="flex-1 flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80"
              role="tablist"
              aria-label="Tipo de filtro taxonômico"
            >
              <button
                type="button"
                role="tab"
                aria-selected={currentTab === 'folders'}
                onClick={() => setCurrentTab('folders')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  currentTab === 'folders'
                    ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Folder className={cn("w-3.5 h-3.5", currentTab === 'folders' ? "text-amber-400" : "text-zinc-500")} />
                <span>Pastas</span>
                <span className="text-[10px] font-mono text-zinc-500">
                  ({folders.length})
                </span>
                {selectedFolderId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={currentTab === 'tags'}
                onClick={() => setCurrentTab('tags')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  currentTab === 'tags'
                    ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Tag className={cn("w-3.5 h-3.5", currentTab === 'tags' ? "text-emerald-400" : "text-zinc-500")} />
                <span>Tags</span>
                <span className="text-[10px] font-mono text-zinc-500">
                  ({tags.length})
                </span>
                {totalActiveTags > 0 && (
                  <span className="px-1 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                    {totalActiveTags}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={currentTab === 'media'}
                onClick={() => setCurrentTab('media')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  currentTab === 'media'
                    ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Film className={cn("w-3.5 h-3.5", currentTab === 'media' ? "text-amber-400" : "text-zinc-500")} />
                <span>Mídia</span>
                {videoCount > 0 && (
                  <span className="text-[10px] font-mono text-zinc-500">
                    ({videoCount})
                  </span>
                )}
                {isMediaFiltered && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                )}
              </button>
            </div>

            {totalActiveFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (currentTab === 'folders') {
                    onSelectFolder(null)
                  } else if (currentTab === 'tags') {
                    let cleaned = searchQuery
                    for (const t of [...parsed.includedTags, ...parsed.excludedTags]) {
                      cleaned = toggleTagInQuery(cleaned, t, 'remove')
                    }
                    onSearchQueryChange(cleaned)
                  } else if (currentTab === 'media') {
                    onMediaTypeFilterChange?.('all')
                  }
                }}
                className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer shrink-0"
                title="Limpar filtro da aba atual"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Search Input inside Popover (Only for folders and tags) */}
          {currentTab !== 'media' && (
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={
                  currentTab === 'folders'
                    ? `Buscar pasta em ${libraryLabel}...`
                    : "Filtrar tags ou categorias (#tag / -tag)..."
                }
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* TAB 1: FOLDERS */}
          {currentTab === 'folders' && (
            <>
              <div className="mb-1">
                <button
                  type="button"
                  onClick={() => handleSelectFolder(null)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer",
                    selectedFolderId === null
                      ? "bg-zinc-800/90 text-white font-medium border border-zinc-700"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Todas as Pastas ({libraryLabel})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {totalCount.toLocaleString()}
                    </span>
                    {selectedFolderId === null && (
                      <Check className="w-3 h-3 text-zinc-300" />
                    )}
                  </div>
                </button>
              </div>

              <div className="max-h-68 overflow-y-auto space-y-0.5 pr-1 -mr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                {folders.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    Nenhuma pasta encontrada nesta biblioteca.
                  </div>
                ) : (
                  folders.map((folder) => (
                    <FolderTreeItem
                      key={folder.id}
                      folder={folder}
                      selectedFolderId={selectedFolderId}
                      onSelectFolder={handleSelectFolder}
                      depth={0}
                      searchFilter={filterText}
                    />
                  ))
                )}
              </div>

              <div className="pt-2 mt-2 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500">
                <span>{folders.length} coleções mapeadas</span>
                {selectedFolderId && (
                  <button
                    type="button"
                    onClick={() => handleSelectFolder(null)}
                    className="text-zinc-400 hover:text-white hover:underline cursor-pointer"
                  >
                    Resetar pasta
                  </button>
                )}
              </div>
            </>
          )}

          {/* TAB 2: SMART TAGS */}
          {currentTab === 'tags' && (
            <>
              {/* Tag Groups Horizontal Bar */}
              {tagsGroups.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-2 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(null)}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                      selectedGroupId === null
                        ? "bg-zinc-800 text-white border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200 bg-zinc-900/60"
                    )}
                  >
                    Todas
                  </button>
                  {tagsGroups.map((group) => {
                    const isSelected = selectedGroupId === group.id
                    const cleanName =
                      group.name.replace(/^[^\w\s\d]+|\d+\.\s*/g, '').trim() || group.name
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedGroupId(isSelected ? null : group.id)}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                          isSelected
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "text-zinc-400 hover:text-zinc-200 bg-zinc-900/60 border border-zinc-800"
                        )}
                      >
                        {cleanName}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Active Tag Chips Summary inside Popover */}
              {(parsed.includedTags.length > 0 || parsed.excludedTags.length > 0) && (
                <div className="flex flex-wrap items-center gap-1 p-1.5 mb-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80">
                  <span className="text-[10px] font-medium text-zinc-500 mr-1">Ativas:</span>
                  {parsed.includedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[11px] font-medium text-emerald-300"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'remove'))}
                        className="p-0.5 rounded-full hover:bg-emerald-500/30 text-emerald-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  {parsed.excludedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/35 text-[11px] font-medium text-rose-300"
                    >
                      <span>-{tag}</span>
                      <button
                        type="button"
                        onClick={() => onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'remove'))}
                        className="p-0.5 rounded-full hover:bg-rose-500/30 text-rose-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      let cleaned = searchQuery
                      for (const t of [...parsed.includedTags, ...parsed.excludedTags]) {
                        cleaned = toggleTagInQuery(cleaned, t, 'remove')
                      }
                      onSearchQueryChange(cleaned)
                    }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-200 ml-auto px-1 cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              )}

              {/* Tags List */}
              <div className="max-h-68 overflow-y-auto space-y-1 pr-1 -mr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                {filteredTags.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    Nenhuma tag encontrada para &quot;{filterText}&quot;.
                  </div>
                ) : (
                  filteredTags.map((tag) => {
                    const norm = tag.name.toLowerCase()
                    const isIncluded = parsed.includedTags.some((t) => t.toLowerCase() === norm)
                    const isExcluded = parsed.excludedTags.some((t) => t.toLowerCase() === norm)
                    const groupName = tagToGroupMap.get(norm)

                    return (
                      <div
                        key={tag.name}
                        onClick={() => handleIncludeTag(tag.name)}
                        className={cn(
                          "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer group",
                          isIncluded
                            ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                            : isExcluded
                            ? "bg-rose-500/15 text-rose-200 border border-rose-500/30"
                            : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                          <Tag
                            className={cn(
                              "w-3 h-3 shrink-0",
                              isIncluded
                                ? "text-emerald-400"
                                : isExcluded
                                ? "text-rose-400"
                                : "text-zinc-500 group-hover:text-zinc-400"
                            )}
                          />
                          <span className="truncate text-xs font-medium">#{tag.name}</span>
                          {groupName && (
                            <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 rounded hidden sm:inline truncate max-w-[100px]">
                              {groupName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={cn(
                              "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                              isIncluded
                                ? "bg-emerald-500/20 text-emerald-300"
                                : isExcluded
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-zinc-900 text-zinc-500 group-hover:text-zinc-400 border border-zinc-800"
                            )}
                          >
                            {tag.count.toLocaleString()}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleIncludeTag(tag.name)
                            }}
                            title={isIncluded ? "Remover filtro" : "Incluir tag (+)"}
                            className={cn(
                              "p-1 rounded-md transition-colors cursor-pointer",
                              isIncluded
                                ? "bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40"
                                : "text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800"
                            )}
                          >
                            {isIncluded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleExcludeTag(tag.name, e)}
                            title={isExcluded ? "Remover exclusão" : "Excluir tag (-)"}
                            className={cn(
                              "p-1 rounded-md transition-colors cursor-pointer",
                              isExcluded
                                ? "bg-rose-500/30 text-rose-300 hover:bg-rose-500/40"
                                : "text-zinc-400 hover:text-rose-300 hover:bg-zinc-800"
                            )}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="pt-2 mt-2 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500">
                <span>
                  Clique para <span className="text-emerald-400">+incluir</span> ou <span className="text-rose-400">-excluir</span>
                </span>
                <span className="font-mono text-zinc-400">#tag / -tag</span>
              </div>
            </>
          )}

          {/* TAB 3: MEDIA (All vs Videos vs Images) */}
          {currentTab === 'media' && (
            <div className="space-y-2 pt-1 pb-1">
              <div className="space-y-1.5">
                {[
                  {
                    id: 'all' as MediaTypeFilter,
                    label: 'Todas as Mídias',
                    description: 'Imagens estáticas e vídeos do acervo',
                    count: totalCount,
                    icon: LayoutGrid,
                    color: 'text-zinc-300',
                    badgeColor: 'bg-zinc-800 text-zinc-300',
                  },
                  {
                    id: 'video' as MediaTypeFilter,
                    label: 'Apenas Vídeos',
                    description: 'Preview nativo no hover & motion scrubbing',
                    count: videoCount,
                    icon: Film,
                    color: 'text-amber-400',
                    badgeColor: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
                  },
                  {
                    id: 'image' as MediaTypeFilter,
                    label: 'Apenas Imagens',
                    description: 'Obras visuais estáticas (PNG, JPG, WEBP)',
                    count: imageCount,
                    icon: ImageIcon,
                    color: 'text-sky-400',
                    badgeColor: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
                  },
                ].map((opt) => {
                  const isSelected = (mediaTypeFilter || 'all') === opt.id
                  const Icon = opt.icon

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onMediaTypeFilterChange?.(opt.id)
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer group",
                        isSelected
                          ? "bg-zinc-800/90 border border-zinc-700/90 shadow-xs"
                          : "hover:bg-zinc-900/70 border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                            isSelected ? "bg-zinc-700/80" : "bg-zinc-900 group-hover:bg-zinc-800"
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", opt.color)} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                            <span>{opt.label}</span>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            {opt.description}
                          </div>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0",
                          opt.badgeColor
                        )}
                      >
                        {opt.count.toLocaleString()}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Informative footer */}
              <div className="mt-2 pt-2 border-t border-zinc-900 flex flex-col gap-1 text-[10px] text-zinc-500">
                <div>
                  <strong className="text-zinc-400 font-medium">Motion Scrubbing:</strong> Passe o mouse por 350ms sobre um card de vídeo e mova horizontalmente para navegar quadro a quadro.
                </div>
                <div>
                  <strong className="text-zinc-400 font-medium">Atalho global:</strong> Pressione <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 font-mono">V</kbd> para alternar rapidamente entre vídeos e todas as mídias.
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
})

export const TaxonomyPopover = EagleTaxonomyPopover
export type TaxonomyPopoverProps = EagleTaxonomyPopoverProps

