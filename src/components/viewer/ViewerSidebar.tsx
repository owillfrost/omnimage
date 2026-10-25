import { memo, useState, useEffect } from 'react'
import { AsciiReveal } from '../ui/AsciiReveal'
import {
  Sparkles,
  FolderOpen,
  Folder,
  Copy,
  Check,
  Filter,
  Tag,
  FileImage,
  Globe,
  Maximize2,
  Edit3,
  Plus,
  X,
  Save,
  Workflow,
} from 'lucide-react'
import type { Artwork } from '../../types/artwork'
import { useTransientValue } from '../../hooks/useCopyFeedback'
import { useItemDetail, resolveArtworkLibAndId } from '../../hooks/useItemDetail'
import { ComparisonSidebar } from './ComparisonSidebar'
import { getCatalogProvider } from '../../providers/providerFactory'

// ── Helpers ──────────────────────────────────────────────────────────────

async function callItemAction(rawId: string, lib: string) {
  const provider = getCatalogProvider()
  const res = await provider.revealItemInExplorer(lib, rawId)
  return { status: res.ok ? 'success' : 'error', filePath: res.filePath }
}

const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-400'
const actionBtn =
  'flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 text-zinc-200 text-xs font-medium transition-all'

// ── Section 1 — Catalog Actions ──────────────────────────────────────────

function CatalogActions({ artwork }: { artwork: Artwork }) {
  const { lib, rawId } = resolveArtworkLibAndId(artwork)
  const [loading, setLoading] = useState<'reveal' | 'info' | null>(null)
  const [done, flashDone] = useTransientValue<'reveal' | 'info'>(2500)

  if (artwork.isTextQuery) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Busca Semântica IA</h3>
          <span className="text-[10px] font-mono text-amber-400">CLIP ViT-B/32</span>
        </div>
        <div className="p-3 rounded-xl bg-zinc-900/90 border border-amber-500/25 text-xs text-zinc-300 space-y-1.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-amber-300 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Âncora de Conceito Estético</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Vetor de 512 dimensões Int8 projetado pelo modelo CLIP para encontrar referências no acervo pela essência visual, mesmo sem nenhuma tag cadastrada.
          </p>
        </div>
      </div>
    )
  }

  const run = async (action: 'reveal' | 'info') => {
    setLoading(action)
    try {
      const data = await callItemAction(rawId, lib)
      if (data.status !== 'success') return
      if (action === 'info') {
        if (!data.filePath) return
        await navigator.clipboard.writeText(data.filePath)
      }
      flashDone(action)
    } catch {
      // Ignore network/clipboard errors
    } finally {
      setLoading(null)
    }
  }

  const label = (action: 'reveal' | 'info', idle: string, busy: string, ok: string) =>
    done === action ? ok : loading === action ? busy : idle

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h3 className={sectionTitle}>Ações do Arquivo</h3>
        <span className="text-[10px] font-mono text-zinc-600">{rawId}</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => run('reveal')}
          disabled={loading === 'reveal'}
          className={`${actionBtn} cursor-pointer`}
        >
          <span className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-white" />
            {label('reveal', 'Mostrar na Pasta (Explorer)', 'Abrindo Explorer...', 'Aberto no Explorer!')}
          </span>
          {done === 'reveal' && <Check className="w-3.5 h-3.5 text-white" />}
        </button>

        <button
          onClick={() => run('info')}
          disabled={loading === 'info'}
          className={`${actionBtn} cursor-pointer`}
        >
          <span className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-white" />
            {label('info', 'Copiar Caminho Local', 'Obtendo caminho...', 'Caminho Copiado!')}
          </span>
          {done === 'info' && <Check className="w-3.5 h-3.5 text-white" />}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={artwork.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-all"
          >
            <Maximize2 className="w-3.5 h-3.5 text-white" />
            <span>Arquivo Original</span>
          </a>

          {artwork.sourceUrl && artwork.sourceUrl !== '#' ? (
            <a
              href={artwork.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-all"
            >
              <Globe className="w-3.5 h-3.5 text-white" />
              <span>URL de Referência</span>
            </a>
          ) : (
            <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/40 border border-zinc-900 text-zinc-600 text-xs">
              <Globe className="w-3.5 h-3.5 text-white" />
              <span>Sem URL</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section 2 — Color Palette ────────────────────────────────────────────

function PalettePanel({
  artwork,
  selectedColors,
  onToggleColor,
}: {
  artwork: Artwork
  selectedColors: string[]
  onToggleColor: (hex: string) => void
}) {
  const [copiedHex, flashCopied] = useTransientValue<string>(1800)

  // Deduplicated palette list starting with dominantColor
  const allColors = Array.from(new Set([artwork.dominantColor, ...(artwork.palette || [])].filter(Boolean)))

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex.toUpperCase())
      flashCopied(hex)
    } catch {
      // Ignore clipboard errors
    }
  }

  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-800/80">
      <div className="flex items-center justify-between">
        <h3 className={sectionTitle}>Color Palette</h3>
        <span className="text-[11px] text-zinc-500">{allColors.length} tons</span>
      </div>

      {/* Visual Color Strip */}
      {allColors.length > 0 && (
        <div className="flex h-3 w-full rounded-full overflow-hidden border border-zinc-800">
          {allColors.map(hex => (
            <div
              key={`bar-${hex}`}
              className="flex-1 h-full transition-all hover:flex-[1.5]"
              style={{ backgroundColor: hex }}
              title={hex.toUpperCase()}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 mt-1">
        {allColors.map((hex, index) => {
          const isSelected = selectedColors.some(c => c.toLowerCase() === hex.toLowerCase())
          const isCopied = copiedHex === hex

          return (
            <div
              key={`${hex}-${index}`}
              className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/80 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg shadow-inner border border-white/10 shrink-0"
                  style={{ backgroundColor: hex }}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-medium text-zinc-200">{hex.toUpperCase()}</span>
                  {index === 0 && <span className="text-[10px] text-zinc-500">Tom Dominante</span>}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCopyHex(hex)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono transition-colors cursor-pointer"
                  title="Copiar código HEX"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3 text-white" />
                      <span className="text-emerald-300">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-white" />
                      <span>HEX</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => onToggleColor(hex)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    isSelected ? 'bg-white text-zinc-950 border border-white font-medium' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-transparent'
                  }`}
                  title="Filtrar acervo por este tom cromático"
                >
                  <Filter className="w-3 h-3 text-white" />
                  <span>{isSelected ? 'Ativo' : 'Filtrar tom'}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Section 3 — Design Essentials & Inline CRUD Editor ────────────────────

function DesignEssentials({
  artwork,
  onSearchTag,
  folderNameMap,
  onSelectFolder,
  onClose,
}: {
  artwork: Artwork
  onSearchTag: (tag: string) => void
  folderNameMap?: Record<string, string>
  onSelectFolder?: (folderId: string | null) => void
  onClose: () => void
}) {
  const { lib, rawId } = resolveArtworkLibAndId(artwork)
  const { detail } = useItemDetail(artwork)
  const comfy = detail?.comfy?.hasWorkflow ? detail.comfy : null

  const [copiedPrompt, flashCopied] = useTransientValue<true>(2000)
  const [copiedWorkflow, flashCopiedWorkflow] = useTransientValue<true>(2000)
  const [copiedNegPrompt, flashCopiedNeg] = useTransientValue<true>(2000)

  // CRUD Editing State
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(artwork.title)
  const [prompt, setPrompt] = useState(artwork.culture !== 'Local Asset' ? artwork.culture : '')
  const [url, setUrl] = useState(artwork.url || '')
  const [tags, setTags] = useState<string[]>(
    artwork.tags && artwork.tags.length > 0
      ? artwork.tags
      : artwork.artist && artwork.artist !== artwork.source
      ? artwork.artist.split(',').map(t => t.trim()).filter(Boolean)
      : []
  )
  const [newTagInput, setNewTagInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, flashSaved] = useTransientValue<true>(2000)

  // Hydrate prompt from itemDetail or ComfyUI metadata when loaded
  useEffect(() => {
    const resolvedPrompt = detail?.annotation || detail?.comfy?.positivePrompt
    if (resolvedPrompt) {
      setPrompt(prev => (prev && prev.length >= 10 ? prev : resolvedPrompt))
      if (!artwork.culture || artwork.culture === 'Local Asset' || artwork.culture.length < 10) {
        artwork.culture = resolvedPrompt
      }
    }
  }, [detail, artwork])

  const handleCopyPrompt = async () => {
    const textToCopy = prompt || comfy?.positivePrompt || ''
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      flashCopied(true)
    } catch {
      // Ignore clipboard errors
    }
  }

  const handleCopyWorkflow = async () => {
    if (!comfy?.workflowJson) return
    try {
      await navigator.clipboard.writeText(comfy.workflowJson)
      flashCopiedWorkflow(true)
    } catch {
      // Ignore clipboard errors
    }
  }

  const handleCopyNegPrompt = async () => {
    if (!comfy?.negativePrompt) return
    try {
      await navigator.clipboard.writeText(comfy.negativePrompt)
      flashCopiedNeg(true)
    } catch {
      // Ignore clipboard errors
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const provider = getCatalogProvider()
      const patch = {
        name: (title || '').trim(),
        annotation: (prompt || '').trim(),
        url: (url || '').trim(),
        tags: tags,
      }

      await provider.updateItemMetadata(lib, rawId, patch)

      // Update in-memory artwork reference
      artwork.title = patch.name
      artwork.culture = patch.annotation || 'Local Asset'
      artwork.url = patch.url
      artwork.tags = tags
      artwork.artist = tags.join(', ')

      flashSaved(true)
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update metadata:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTag = () => {
    const clean = newTagInput.trim().replace(/^#/, '')
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean])
      setNewTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  return (
    <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800/80">
      <div className="flex items-center justify-between">
        <h3 className={sectionTitle}>Design Essentials & Metadados</h3>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] transition-colors cursor-pointer"
        >
          <Edit3 className="w-3 h-3 text-zinc-400" />
          <span>{isEditing ? 'Fechar Edição' : 'Editar'}</span>
        </button>
      </div>

      {/* Inline CRUD Editor Mode */}
      {isEditing ? (
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-900 border border-amber-500/40 text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-zinc-400">Título / Nome</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-zinc-400">URL de Referência</label>
            <input
              type="text"
              value={url}
              placeholder="https://..."
              onChange={e => setUrl(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-zinc-400">Prompt / Anotação Completa</label>
            <textarea
              rows={4}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Prompt detalhado da arte gerativa..."
              className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs leading-relaxed focus:outline-none focus:border-amber-400 resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-semibold text-zinc-400">Tags do Item</label>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="p-0.5 hover:text-red-400 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                placeholder="Nova tag..."
                className="flex-1 px-2 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs shadow-md transition-all active:scale-[0.98]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Salvando...' : 'Salvar (Dual-Write)'}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {saveSuccess && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              <Check className="w-3.5 h-3.5 text-white" />
              <span>Metadados sincronizados no Sidecar e SQLite!</span>
            </div>
          )}

          {comfy && (
            <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  <Workflow className="w-3.5 h-3.5 text-amber-400" />
                  ComfyUI Workflow (PNG)
                </span>
                {comfy.model && (
                  <span
                    className="text-[10px] font-mono text-zinc-400 truncate max-w-[160px]"
                    title={comfy.model}
                  >
                    {comfy.model}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {comfy.workflowJson && (
                  <button
                    type="button"
                    onClick={handleCopyWorkflow}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/80 text-zinc-200 hover:text-white text-xs font-medium transition-all cursor-pointer"
                    title="Copiar JSON do Workflow para colar direto no ComfyUI (Ctrl+V)"
                  >
                    {copiedWorkflow ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Workflow Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Workflow className="w-3.5 h-3.5 text-amber-400" />
                        <span>Copiar Workflow</span>
                      </>
                    )}
                  </button>
                )}

                {(prompt || comfy.positivePrompt) && (
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/80 text-zinc-200 hover:text-white text-xs font-medium transition-all cursor-pointer"
                    title="Copiar Prompt Positivo"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Prompt Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-amber-400" />
                        <span>Copiar Prompt</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {(comfy.steps !== undefined ||
                comfy.cfg !== undefined ||
                comfy.sampler ||
                comfy.seed !== undefined ||
                (comfy.loras && comfy.loras.length > 0)) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {comfy.steps !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                      Steps: {comfy.steps}
                    </span>
                  )}
                  {comfy.cfg !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                      CFG: {comfy.cfg}
                    </span>
                  )}
                  {comfy.sampler && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                      {comfy.sampler}{comfy.scheduler ? ` (${comfy.scheduler})` : ''}
                    </span>
                  )}
                  {comfy.seed !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                      Seed: {String(comfy.seed)}
                    </span>
                  )}
                  {comfy.loras?.map(lora => (
                    <span
                      key={lora}
                      className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-300 truncate max-w-[200px]"
                      title={lora}
                    >
                      LoRA: {lora}
                    </span>
                  ))}
                </div>
              )}

              {comfy.negativePrompt && (
                <div className="flex flex-col gap-1 pt-1.5 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-zinc-400">Negative Prompt</span>
                    <button
                      type="button"
                      onClick={handleCopyNegPrompt}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] transition-colors cursor-pointer"
                    >
                      {copiedNegPrompt ? (
                        <span className="text-emerald-300">Copiado!</span>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5 text-zinc-400" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-2 break-words">
                    {comfy.negativePrompt}
                  </p>
                </div>
              )}
            </div>
          )}

          {prompt && (
            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800/90">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-400">Prompt / Anotação</span>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] transition-colors cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3 h-3 text-white" />
                      <span className="text-emerald-300">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-white" />
                      <span>Copiar Prompt</span>
                    </>
                  )}
                </button>
              </div>
              <AsciiReveal key={`prompt-${artwork.id}`} preset="decode" duration="fast" speed={1.5}>
                <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto pr-1">
                  {prompt}
                </p>
              </AsciiReveal>
            </div>
          )}

          {artwork.folders && artwork.folders.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Folder className="w-3 h-3 text-amber-400" />
                Coleções ({artwork.folders.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {artwork.folders.map(folderId => {
                  const name = folderNameMap?.[folderId] || folderId
                  return (
                    <button
                      key={folderId}
                      onClick={() => {
                        onSelectFolder?.(folderId)
                        onClose()
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs transition-all cursor-pointer"
                      title="Filtrar galeria por esta pasta"
                    >
                      <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>{name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-white" />
                Tags e Categorias ({tags.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      onSearchTag(tag.startsWith('#') ? tag : `#${tag}`)
                      onClose()
                    }}
                    className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs transition-all cursor-pointer"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Single Item View ──────────────────────────────────────────────────

function SingleItemView({
  artwork,
  selectedColors,
  onToggleColor,
  onSearchTag,
  folderNameMap,
  onSelectFolder,
  onClose,
}: {
  artwork: Artwork
  selectedColors: string[]
  onToggleColor: (hex: string) => void
  onSearchTag: (tag: string) => void
  folderNameMap?: Record<string, string>
  onSelectFolder?: (folderId: string | null) => void
  onClose: () => void
}) {
  return (
    <>
      <AsciiReveal
        key={artwork.id}
        preset="decode"
        duration="fast"
        speed={1.4}
        className="flex flex-col gap-2 pb-4 border-b border-zinc-800/80"
      >
        <div className="flex items-center justify-between gap-2">
          <span data-ascii="fade" className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-900 text-zinc-300 border border-zinc-800">
            <Sparkles className="w-3 h-3 text-white" />
            {artwork.source}
          </span>
          <span className="text-[11px] font-mono text-zinc-500">{artwork.date}</span>
        </div>
        <h2 className="text-base font-semibold text-zinc-100 leading-snug break-words">
          {artwork.title}
        </h2>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <FileImage className="w-3.5 h-3.5 text-white shrink-0" />
          <span>{artwork.medium}</span>
        </div>
      </AsciiReveal>

      <CatalogActions artwork={artwork} />
      <PalettePanel artwork={artwork} selectedColors={selectedColors} onToggleColor={onToggleColor} />
      <DesignEssentials
        artwork={artwork}
        onSearchTag={onSearchTag}
        folderNameMap={folderNameMap}
        onSelectFolder={onSelectFolder}
        onClose={onClose}
      />
    </>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────

export interface ViewerSidebarProps {
  artwork: Artwork
  compareArtwork?: Artwork | null
  selectedColors: string[]
  onToggleColor: (hex: string) => void
  onSearchTag: (tag: string) => void
  folderNameMap?: Record<string, string>
  onSelectFolder?: (folderId: string | null) => void
  onClose: () => void
  onSwapCompare?: () => void
  onClearCompare?: () => void
}

/**
 * Right sidebar: Catalog actions, color palette, prompt/tags and inline CRUD editor.
 * When compareArtwork is active, presents a dedicated side-by-side diff inspector
 * or tabbed individual views (Diff | Ref A | Ref B).
 */
export const ViewerSidebar = memo(function ViewerSidebar({
  artwork,
  compareArtwork,
  selectedColors,
  onToggleColor,
  onSearchTag,
  folderNameMap,
  onSelectFolder,
  onClose,
  onSwapCompare,
  onClearCompare,
}: ViewerSidebarProps) {
  const [sidebarTab, setSidebarTab] = useState<'diff' | 'refA' | 'refB'>('diff')

  return (
    <aside className="w-full lg:w-[390px] h-auto lg:h-full shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-800/80 bg-zinc-950/90 p-6 overflow-y-auto flex flex-col gap-5">
      {/* Tab Switcher (Only visible in Split Comparison Mode) */}
      {compareArtwork && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <button
            type="button"
            onClick={() => setSidebarTab('diff')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              sidebarTab === 'diff'
                ? 'bg-zinc-100 text-zinc-950 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Diff Comparativo
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('refA')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              sidebarTab === 'refA'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Referência A
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('refB')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              sidebarTab === 'refB'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Referência B
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {compareArtwork ? (
        sidebarTab === 'diff' ? (
          <ComparisonSidebar
            artworkA={artwork}
            artworkB={compareArtwork}
            selectedColors={selectedColors}
            onToggleColor={onToggleColor}
            onSearchTag={onSearchTag}
            folderNameMap={folderNameMap}
            onSelectFolder={onSelectFolder}
            onSwapCompare={onSwapCompare}
            onClearCompare={onClearCompare}
            onClose={onClearCompare || onClose}
          />
        ) : sidebarTab === 'refA' ? (
          <SingleItemView
            artwork={artwork}
            selectedColors={selectedColors}
            onToggleColor={onToggleColor}
            onSearchTag={onSearchTag}
            folderNameMap={folderNameMap}
            onSelectFolder={onSelectFolder}
            onClose={onClose}
          />
        ) : (
          <SingleItemView
            artwork={compareArtwork}
            selectedColors={selectedColors}
            onToggleColor={onToggleColor}
            onSearchTag={onSearchTag}
            folderNameMap={folderNameMap}
            onSelectFolder={onSelectFolder}
            onClose={onClose}
          />
        )
      ) : (
        <SingleItemView
          artwork={artwork}
          selectedColors={selectedColors}
          onToggleColor={onToggleColor}
          onSearchTag={onSearchTag}
          folderNameMap={folderNameMap}
          onSelectFolder={onSelectFolder}
          onClose={onClose}
        />
      )}
    </aside>
  )
})


