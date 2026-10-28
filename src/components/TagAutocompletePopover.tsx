import * as React from "react"
import {
  Tag,
  Plus,
  Minus,
  Check,
  X,
  Search,
  Sparkles,
} from "lucide-react"
import type { CatalogTagFacet as EagleTagFacet, CatalogTagGroup as EagleTagGroup } from "../contracts/schemas"
import { parseSearchQuery, toggleTagInQuery } from "../core/tagFilter"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "../i18n"

export interface TagAutocompletePopoverProps {
  tags: EagleTagFacet[]
  tagsGroups?: EagleTagGroup[]
  searchQuery: string
  onSearchQueryChange: (newQuery: string) => void
  disabled?: boolean
}

export const TagAutocompletePopover: React.FC<TagAutocompletePopoverProps> = React.memo(({
tags = [],
  tagsGroups = [],
  searchQuery,
  onSearchQueryChange,
  disabled = false,
}) => {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = React.useState(false)
  const [filterText, setFilterText] = React.useState("")
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)

  const parsed = React.useMemo(() => parseSearchQuery(searchQuery), [searchQuery])

  // Build a reverse map from tag name (lowercase) -> group name
  const tagToGroupMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const group of tagsGroups) {
      if (Array.isArray(group.tags)) {
        for (const t of group.tags) {
          // Clean group name like "📸 04. Câmeras & Óptica" -> "Câmeras & Óptica"
          const cleanGroupName = group.name.replace(/^[^\w\s\d]+|\d+\.\s*/g, '').trim() || group.name
          map.set(t.toLowerCase(), cleanGroupName)
        }
      }
    }
    return map
  }, [tagsGroups])

  // Filter tags based on selected group and filterText
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

    return result.slice(0, 100) // Render top 100 matches for ultra-smooth 120 FPS
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

  const totalActiveTags = parsed.includedTags.length + parsed.excludedTags.length

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
                  totalActiveTags > 0
                    ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-100"
                )}
                aria-label={t("taxonomy.filterAria")}
              >
                <Tag className="w-4 h-4" />
                {totalActiveTags > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 text-zinc-950 text-[9px] font-bold flex items-center justify-center leading-none">
                    {totalActiveTags}
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {totalActiveTags > 0
              ? `${totalActiveTags} tags ativas (${parsed.includedTags.length} inclusas, ${parsed.excludedTags.length} exclusas)`
              : "Smart Filter de Tags & Operadores (#tag, -tag)"}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-84 sm:w-96 p-3 bg-zinc-950/95 border-zinc-800 backdrop-blur-2xl shadow-2xl rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80">
            <div className="flex items-center gap-1.5 text-zinc-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wider">
                Smart Tags do Eagle
              </h4>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              {tags.length} tags cadastradas
            </span>
          </div>

          {/* Quick Filter Input */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={t("taxonomy.searchTagsPlaceholder")}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-8 pr-7 py-1 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Tag Groups Bar (if library has tagsGroups, e.g. Google Flow or Design) */}
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
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                        : "text-zinc-400 hover:text-zinc-200 bg-zinc-900/60 border border-zinc-800"
                    )}
                  >
                    {cleanName}
                  </button>
                )
              })}
            </div>
          )}

          {/* Active Tag Chips (Directly removable) */}
          {(parsed.includedTags.length > 0 || parsed.excludedTags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1 p-1.5 mb-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80">
              <span className="text-[10px] font-medium text-zinc-500 mr-1">{t("taxonomy.activeTagsLabel")}</span>
              {parsed.includedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[11px] font-medium text-emerald-300"
                >
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => onSearchQueryChange(toggleTagInQuery(searchQuery, tag, 'remove'))}
                    className="p-0.5 rounded-full hover:bg-emerald-500/30 text-emerald-400 hover:text-white"
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
                    className="p-0.5 rounded-full hover:bg-rose-500/30 text-rose-400 hover:text-white"
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
                {t("taxonomy.noTagsFound", { query: filterText })}
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

                      {/* Inclusion / Exclusion quick toggle buttons */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleIncludeTag(tag.name)
                        }}
                        title={isIncluded ? t("taxonomy.removeTag") : t("taxonomy.includeTag")}
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
                        title={isExcluded ? t("taxonomy.removeExclude") : t("taxonomy.excludeTag")}
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

          {/* Footer instructions */}
          <div className="pt-2 mt-2 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500">
            <span>
              {t("taxonomy.tagsHint")}
            </span>
            <span className="font-mono text-zinc-400">#tag ou -tag</span>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
})
