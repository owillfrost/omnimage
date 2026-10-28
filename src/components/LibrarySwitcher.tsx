import * as React from "react"
import {
  Sparkles,
  BrainCircuit,
  Library,
  ChevronDown,
  FolderPlus,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  FolderCheck,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getCatalogProvider } from "../providers/providerFactory"
import type { LibrarySource } from "../contracts/schemas"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useI18n } from "../i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

export interface LibrarySwitcherProps {
  currentLibrary: string
  onSelectLibrary: (lib: string) => void
  isLoading?: boolean
}

const DEFAULT_FALLBACK_SOURCES: LibrarySource[] = [
  {
    id: 'design',
    name: 'Design.library',
    path: './libraries/Design.library',
    type: 'eagle-library',
    itemCount: 0,
    indexedEmbeddingCount: 0,
    hidden: false,
  },
  {
    id: 'google-flow',
    name: 'Google Flow + Prompts',
    path: './libraries/Prompts.library',
    type: 'eagle-library',
    itemCount: 0,
    indexedEmbeddingCount: 0,
    hidden: false,
  },
]

function formatShortLibraryLabel(source: LibrarySource): string {
  if (source.id === 'design') return 'Design'
  if (source.id === 'google-flow') return 'Prompts'
  return source.name.replace(/\.library$/i, '')
}

export const LibrarySwitcher: React.FC<LibrarySwitcherProps> = ({
  currentLibrary,
  onSelectLibrary,
  isLoading = false,
}) => {
  const { t } = useI18n()
  const [sources, setSources] = React.useState<LibrarySource[]>(DEFAULT_FALLBACK_SOURCES)
  const [isAddOpen, setIsAddOpen] = React.useState(false)
  const [folderPathInput, setFolderPathInput] = React.useState('')
  const [libraryIdInput, setLibraryIdInput] = React.useState('')
  const [importMode, setImportMode] = React.useState<'hardlink' | 'copy'>('hardlink')
  const [isScanning, setIsScanning] = React.useState(false)
  const [syncingLibId, setSyncingLibId] = React.useState<string | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  // Remove confirmation dialog state
  const [libraryToRemove, setLibraryToRemove] = React.useState<LibrarySource | null>(null)
  const [deleteFilesOnDisk, setDeleteFilesOnDisk] = React.useState(false)
  const [isRemoving, setIsRemoving] = React.useState(false)

  const loadLibraries = React.useCallback(async () => {
    try {
      const libs = await getCatalogProvider().listLibraries()
      if (Array.isArray(libs) && libs.length > 0) {
        setSources(libs)
      }
    } catch {
      // keep existing
    }
  }, [])

  React.useEffect(() => {
    void loadLibraries()
  }, [loadLibraries])

  const visibleSources = React.useMemo(
    () => sources.filter(s => !s.hidden),
    [sources]
  )
  const hiddenSources = React.useMemo(
    () => sources.filter(s => Boolean(s.hidden)),
    [sources]
  )

  // Show up to 3 visible libraries directly on the top pill bar for instant 1-click switching
  const pillSources = React.useMemo(() => {
    const top = visibleSources.slice(0, 3)
    const activeInVisible = visibleSources.find(s => s.id === currentLibrary)
    if (activeInVisible && !top.some(s => s.id === activeInVisible.id)) {
      return [...top.slice(0, 2), activeInVisible]
    }
    return top
  }, [visibleSources, currentLibrary])

  const handlePickDirectory = async () => {
    if (typeof (window as any).omnimageDesktop?.selectDirectory === 'function') {
      const selected = await (window as any).omnimageDesktop.selectDirectory()
      if (selected) {
        setFolderPathInput(selected)
        if (!libraryIdInput) {
          const leaf = selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'minha-galeria'
          setLibraryIdInput(leaf.replace(/\.library$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-'))
        }
      }
    } else if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const handle = await (window as any).showDirectoryPicker()
        if (handle) {
          setFolderPathInput(handle.name)
          if (!libraryIdInput) {
            setLibraryIdInput(handle.name.replace(/\.library$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-'))
          }
        }
      } catch {
        // User cancelled
      }
    }
  }

  const handleScanFolder = async () => {
    const folderPath = folderPathInput.trim()
    const rawLeaf = folderPath.split(/[/\\]/).filter(Boolean).pop()?.replace(/\.library$/i, '') || 'custom-lib'
    const libId = (libraryIdInput.trim() || rawLeaf).replace(/[^a-zA-Z0-9_-]/g, '-')

    if (!folderPath) {
      setErrorMsg(t('library.specifyFolderPathError'))
      return
    }

    setIsScanning(true)
    setErrorMsg(null)

    try {
      const provider = getCatalogProvider()
      if (provider.scanLibraryFolder) {
        const res = await provider.scanLibraryFolder({
          libraryId: libId,
          folderPath,
          importMode,
        })
        if (res.ok) {
          setIsAddOpen(false)
          setFolderPathInput('')
          setLibraryIdInput('')
          await loadLibraries()
          onSelectLibrary(libId)
        } else {
          setErrorMsg(res.error || t('library.createIndexError'))
        }
      } else {
        const res = await fetch('/api/catalog/scan-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libraryId: libId, folderPath, importMode }),
        })
        const json = await res.json()
        if (json.status === 'success') {
          setIsAddOpen(false)
          setFolderPathInput('')
          setLibraryIdInput('')
          await loadLibraries()
          onSelectLibrary(libId)
        } else {
          setErrorMsg(json.error || t('library.scanFolderError'))
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('library.serverConnectionError'))
    } finally {
      setIsScanning(false)
    }
  }

  const handleSyncExistingLibrary = async (e: React.MouseEvent, source: LibrarySource) => {
    e.stopPropagation()
    const targetFolder = source.sourceFolderPath || source.path
    if (!targetFolder || syncingLibId) return

    setSyncingLibId(source.id)
    try {
      const provider = getCatalogProvider()
      if (provider.scanLibraryFolder) {
        await provider.scanLibraryFolder({
          libraryId: source.id,
          folderPath: targetFolder,
          importMode: 'hardlink',
        })
      } else {
        await fetch('/api/catalog/scan-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libraryId: source.id, folderPath: targetFolder, importMode: 'hardlink' }),
        })
      }
      await loadLibraries()
      if (currentLibrary === source.id) {
        onSelectLibrary(source.id)
      }
    } finally {
      setSyncingLibId(null)
    }
  }

  const handleToggleHidden = async (e: React.MouseEvent, source: LibrarySource, nextHidden: boolean) => {
    e.stopPropagation()
    const provider = getCatalogProvider()
    if (provider.toggleLibraryVisibility) {
      await provider.toggleLibraryVisibility(source.id, nextHidden)
    } else {
      await fetch('/api/catalog/libraries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: source.id, hidden: nextHidden }),
      })
    }

    const updated = sources.map(s => (s.id === source.id ? { ...s, hidden: nextHidden } : s))
    setSources(updated)

    // If user hid the currently active library, switch to the first remaining visible library
    if (nextHidden && currentLibrary === source.id) {
      const fallback = updated.find(s => !s.hidden && s.id !== source.id)
      if (fallback) {
        onSelectLibrary(fallback.id)
      }
    }
  }

  const handleOpenRemoveDialog = (e: React.MouseEvent, source: LibrarySource) => {
    e.stopPropagation()
    setDeleteFilesOnDisk(false)
    setLibraryToRemove(source)
  }

  const handleConfirmRemove = async () => {
    if (!libraryToRemove) return
    setIsRemoving(true)

    try {
      const targetId = libraryToRemove.id
      const provider = getCatalogProvider()
      if (provider.removeLibrary) {
        await provider.removeLibrary(targetId, { deleteFilesOnDisk })
      } else {
        await fetch('/api/catalog/libraries', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libraryId: targetId, deleteFilesOnDisk }),
        })
      }

      const remaining = sources.filter(s => s.id !== targetId)
      setSources(remaining)
      setLibraryToRemove(null)

      if (currentLibrary === targetId) {
        const nextActive = remaining.find(s => !s.hidden) || remaining[0]
        if (nextActive) {
          onSelectLibrary(nextActive.id)
        }
      }
    } finally {
      setIsRemoving(false)
    }
  }

  const previewLibraryPath = React.useMemo(() => {
    const clean = folderPathInput.trim().replace(/[\\/]+$/, '')
    if (!clean) return ''
    if (clean.toLowerCase().endsWith('.library')) return clean
    const leaf = libraryIdInput.trim() || clean.split(/[\\/]/).pop() || 'Collection'
    const lastSep = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'))
    const sep = clean.includes('\\') ? '\\' : '/'
    const parent = lastSep > 0 ? clean.slice(0, lastSep) : clean
    return `${parent}${sep}${leaf}.library`
  }, [folderPathInput, libraryIdInput])

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Library Switcher"
        className="pointer-events-auto flex items-center bg-zinc-950/85 backdrop-blur-xl border border-zinc-800/90 rounded-full p-1 shadow-2xl relative select-none"
      >
        {pillSources.map(source => {
          const isActive = currentLibrary === source.id
          const IconComponent =
            source.id === 'design'
              ? Sparkles
              : source.id === 'google-flow'
              ? BrainCircuit
              : FolderCheck

          const activeIconColor =
            source.id === 'design'
              ? 'text-purple-600'
              : source.id === 'google-flow'
              ? 'text-blue-600'
              : 'text-amber-600'

          return (
            <button
              key={source.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onSelectLibrary(source.id)}
              className={cn(
                "relative flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 cursor-pointer active:scale-[0.97]",
                isActive
                  ? "bg-white text-zinc-950 font-semibold shadow-md"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 font-medium"
              )}
            >
              <IconComponent
                className={cn(
                  "w-3.5 h-3.5 transition-colors",
                  isActive ? activeIconColor : "text-zinc-500"
                )}
              />
              <span className="max-w-28 truncate">{formatShortLibraryLabel(source)}</span>

              {isLoading && isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              )}
            </button>
          )
        })}

        {/* Libraries Manager & Add .library Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("library.manageTitle")}
              className={cn(
                "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-all duration-200 cursor-pointer",
                !pillSources.some(s => s.id === currentLibrary)
                  ? "bg-white text-zinc-950 font-semibold shadow-md"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
              )}
            >
              <Library className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-zinc-950/95 backdrop-blur-xl border-zinc-800 text-zinc-200 w-72 p-1.5 shadow-2xl"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
              <span>Libraries Ativas (.library)</span>
              <span>{visibleSources.length}</span>
            </div>

            {visibleSources.map(source => {
              const isSelected = currentLibrary === source.id
              const isSyncing = syncingLibId === source.id

              return (
                <DropdownMenuItem
                  key={source.id}
                  onClick={() => onSelectLibrary(source.id)}
                  className={cn(
                    "cursor-pointer rounded-lg px-2 py-1.5 text-xs flex items-center justify-between gap-2 group",
                    isSelected
                      ? "bg-zinc-800/90 text-white font-medium"
                      : "hover:bg-zinc-900 text-zinc-300"
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{source.name}</span>
                      {source.itemCount !== undefined && (
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                          ({source.itemCount.toLocaleString()})
                        </span>
                      )}
                    </div>
                    {source.sourceFolderPath && (
                      <span className="text-[10px] text-zinc-500 truncate font-mono">
                        ↳ {source.sourceFolderPath}
                      </span>
                    )}
                  </div>

                  {/* Quick Actions: Sync, Hide, Remove */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      title={t("library.syncTooltip")}
                      onClick={e => handleSyncExistingLibrary(e, source)}
                      className="p-1 rounded-md hover:bg-zinc-700/80 text-zinc-400 hover:text-white transition-colors"
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin text-amber-400")} />
                    </button>

                    <button
                      type="button"
                      title={t("library.hideTooltip")}
                      onClick={e => handleToggleHidden(e, source, true)}
                      className="p-1 rounded-md hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      title={t("library.removeTooltip")}
                      onClick={e => handleOpenRemoveDialog(e, source)}
                      className="p-1 rounded-md hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </DropdownMenuItem>
              )
            })}

            {hiddenSources.length > 0 && (
              <>
                <DropdownMenuSeparator className="bg-zinc-800/80 my-1.5" />
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                  <span>{t("library.hiddenLibraries")}</span>
                  <span>{hiddenSources.length}</span>
                </div>

                {hiddenSources.map(source => (
                  <DropdownMenuItem
                    key={source.id}
                    onClick={e => handleToggleHidden(e, source, false)}
                    className="cursor-pointer rounded-lg px-2 py-1.5 text-xs flex items-center justify-between gap-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <EyeOff className="w-3 h-3 shrink-0 text-zinc-600" />
                      <span className="truncate">{source.name}</span>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        title={t("library.unhideTooltip")}
                        onClick={e => handleToggleHidden(e, source, false)}
                        className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        title={t("library.removeTooltip")}
                        onClick={e => handleOpenRemoveDialog(e, source)}
                        className="p-1 rounded-md hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            <DropdownMenuSeparator className="bg-zinc-800/80 my-1.5" />

            <DropdownMenuItem
              onClick={() => setIsAddOpen(true)}
              className="cursor-pointer rounded-lg px-2.5 py-2 text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 text-xs font-medium flex items-center gap-2"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>{t("library.attachFolder")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Add Folder / Build .library Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-amber-400" />
              <span>{t("library.createModalTitle")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 leading-relaxed">
              Aponte para qualquer pasta de imagens/vídeos. O sistema criará automaticamente uma estrutura{" "}
              <code className="text-amber-300 font-mono">.library/images/&#123;ID&#125;.info/</code> com{" "}
              <code className="text-zinc-300 font-mono">_thumbnail.webp</code> (640px) e{" "}
              <code className="text-zinc-300 font-mono">metadata.json</code> individual.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-300">{t("library.sourceFolder")}</label>
                <button
                  type="button"
                  onClick={handlePickDirectory}
                  className="text-[10px] text-zinc-300 hover:text-white underline font-medium cursor-pointer"
                >
                  {t("library.browsePc")}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="C:\Imagens\MinhasReferencias"
                  value={folderPathInput}
                  onChange={e => setFolderPathInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handlePickDirectory}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Selecionar
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-300">{t("library.libraryName")}</label>
              <input
                type="text"
                placeholder="Comfy"
                value={libraryIdInput}
                onChange={e => setLibraryIdInput(e.target.value)}
                className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-zinc-300">{t("library.ingestionMode")}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('hardlink')}
                  className={cn(
                    "p-2 rounded-lg border text-left transition-all cursor-pointer",
                    importMode === 'hardlink'
                      ? "bg-zinc-800 border-zinc-600 text-white font-medium shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <div className="font-semibold text-[11px]">{t("library.hardlinkMode")}</div>
                  <div className="text-[10px] opacity-80">{t("library.hardlinkDesc")}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('copy')}
                  className={cn(
                    "p-2 rounded-lg border text-left transition-all cursor-pointer",
                    importMode === 'copy'
                      ? "bg-zinc-800 border-zinc-600 text-white font-medium shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <div className="font-semibold text-[11px]">{t("library.copyMode")}</div>
                  <div className="text-[10px] opacity-80">{t("library.copyDesc")}</div>
                </button>
              </div>
            </div>

            {previewLibraryPath && (
              <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-400 font-mono break-all">
                <span className="text-zinc-500 block mb-0.5 font-sans">{t("library.managedPath")}</span>
                <span className="text-emerald-400">{previewLibraryPath}</span>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                {errorMsg}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleScanFolder}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("library.building")}</span>
                </>
              ) : (
                <span>{t("library.createAndIndex")}</span>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Library Confirmation Modal */}
      <Dialog open={Boolean(libraryToRemove)} onOpenChange={open => !open && setLibraryToRemove(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>{t("library.removeModalTitle", { name: libraryToRemove?.name || "" })}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 leading-relaxed">
              Isso removerá a biblioteca da listagem e limpará seu índice em memória (SQLite). Seus arquivos originais na pasta de origem nunca são apagados.
            </DialogDescription>
          </DialogHeader>

          {libraryToRemove && (
            <div className="flex flex-col gap-3 py-2 text-xs">
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-400 break-all">
                {libraryToRemove.path}
              </div>

              {!['design', 'google-flow'].includes(libraryToRemove.id) &&
                libraryToRemove.path?.toLowerCase().endsWith('.library') && (
                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deleteFilesOnDisk}
                      onChange={e => setDeleteFilesOnDisk(e.target.checked)}
                      className="mt-0.5 accent-red-500"
                    />
                    <span className="text-[11px] text-red-200 leading-snug">
                      {t("library.deleteFilesCheckbox", { name: libraryToRemove.name })}
                    </span>
                  </label>
                )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setLibraryToRemove(null)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("library.removing")}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t("library.confirmRemove")}</span>
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

