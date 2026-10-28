import * as React from "react"
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  X,
  Layers,
  Plus,
} from "lucide-react"
import type { CatalogFolderNode } from "../contracts/schemas"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "../i18n"

export type FolderNode = CatalogFolderNode

export interface FolderTreePickerProps {
  folders: FolderNode[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  totalCount: number
  libraryLabel?: string
  disabled?: boolean
}

interface FolderTreeItemProps {
  folder: FolderNode
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

  // Filter children matching search filter
  const matchesSearch =
    !searchFilter ||
    folder.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    folder.children?.some(c => c.name.toLowerCase().includes(searchFilter.toLowerCase()))

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

export const FolderTreePicker: React.FC<FolderTreePickerProps> = React.memo(({
  folders = [],
  selectedFolderId,
  onSelectFolder,
  totalCount,
  libraryLabel = "Biblioteca",
  disabled = false,
}) => {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = React.useState(false)
  const [searchFilter, setSearchFilter] = React.useState("")

  const activeFolder = React.useMemo(() => {
    if (!selectedFolderId) return null
    function findRecursive(list: FolderNode[]): FolderNode | null {
      for (const item of list) {
        if (item.id === selectedFolderId) return item
        if (item.children?.length) {
          const found = findRecursive(item.children)
          if (found) return found
        }
      }
      return null
    }
    return findRecursive(folders)
  }, [folders, selectedFolderId])

  const handleSelect = React.useCallback(
    (folderId: string | null) => {
      onSelectFolder(folderId)
      setIsOpen(false)
    },
    [onSelectFolder]
  )

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelectFolder(null)
    },
    [onSelectFolder]
  )

  const activeColor = activeFolder?.iconColor
    ? activeFolder.iconColor.startsWith('#')
      ? activeFolder.iconColor
      : activeFolder.iconColor === 'green'
      ? '#22c55e'
      : activeFolder.iconColor === 'blue'
      ? '#3b82f6'
      : activeFolder.iconColor === 'yellow'
      ? '#eab308'
      : activeFolder.iconColor === 'red'
      ? '#ef4444'
      : activeFolder.iconColor === 'purple'
      ? '#a855f7'
      : undefined
    : undefined

  if (folders.length === 0 && !selectedFolderId) {
    return null
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "pointer-events-auto flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium backdrop-blur-xl border transition-all duration-200 cursor-pointer shadow-lg active:scale-95 select-none",
                  selectedFolderId
                    ? "bg-zinc-800 text-white border-zinc-600 hover:bg-zinc-700"
                    : "bg-zinc-950/85 text-zinc-400 border-zinc-800/90 hover:text-zinc-200 hover:border-zinc-700"
                )}
              >
                {selectedFolderId && activeFolder ? (
                  <>
                    <FolderOpen
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: activeColor || '#f59e0b' }}
                    />
                    <span className="max-w-[120px] truncate">{activeFolder.name}</span>
                    <span
                      onClick={handleClear}
                      className="ml-0.5 p-0.5 rounded-full hover:bg-amber-500/30 text-amber-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </>
                ) : (
                  <>
                    <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="hidden sm:inline">{t("taxonomy.foldersTab")}</span>
                  </>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {selectedFolderId && activeFolder
              ? t("taxonomy.activeFolderLabel", { name: activeFolder.name, count: activeFolder.itemCount })
              : t("taxonomy.filterByFoldersCount", { count: folders.length })}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 p-0 bg-zinc-950/95 backdrop-blur-2xl border-zinc-800/90 shadow-2xl rounded-2xl overflow-hidden flex flex-col text-zinc-200 z-50"
      >
        <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between gap-2 bg-zinc-900/40">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>{t("taxonomy.foldersTab")}</span>
            <span className="text-[10px] text-zinc-500 font-mono">({folders.length})</span>
          </div>

          {selectedFolderId && (
            <button
              onClick={() => handleSelect(null)}
              className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>{t("common.all")}</span>
            </button>
          )}
        </div>

        <div className="p-2 border-b border-zinc-800/80">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t("taxonomy.searchFoldersPlaceholder", { library: libraryLabel })}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter("")}
                className="absolute right-2 text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          <div
            onClick={() => handleSelect(null)}
            className={cn(
              "flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer",
              selectedFolderId === null
                ? "bg-amber-500/15 text-amber-200 border border-amber-500/30 font-medium"
                : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
            )}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{t("taxonomy.allFolders", { library: libraryLabel })}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {totalCount.toLocaleString()}
            </span>
          </div>

          {folders.map((folder) => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              selectedFolderId={selectedFolderId}
              onSelectFolder={handleSelect}
              searchFilter={searchFilter}
            />
          ))}
        </div>

        {/* Quick Folder Creator */}
        <div className="p-2 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center gap-1.5">
          <input
            type="text"
            id="new-folder-input"
            placeholder={t("taxonomy.newFolderPlaceholder")}
            className="flex-1 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const target = e.currentTarget
                const name = target.value.trim()
                if (name) {
                  const newId = `f_${Date.now().toString(36)}`
                  folders.push({
                    id: newId,
                    name,
                    allFolderIds: [newId],
                    itemCount: 0,
                    directCount: 0,
                    children: [],
                  })
                  handleSelect(newId)
                  target.value = ''
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById('new-folder-input') as HTMLInputElement | null
              if (input && input.value.trim()) {
                const name = input.value.trim()
                const newId = `f_${Date.now().toString(36)}`
                folders.push({
                  id: newId,
                  name,
                  allFolderIds: [newId],
                  itemCount: 0,
                  directCount: 0,
                  children: [],
                })
                handleSelect(newId)
                input.value = ''
              }
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 shrink-0" />
            <span>Criar</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
})

// Backward compatibility alias
export const EagleFolderPicker = FolderTreePicker

