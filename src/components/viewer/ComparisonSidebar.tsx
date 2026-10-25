import React from 'react'
import {
  Sparkles,
  ArrowLeftRight,
  X,
  Copy,
  Check,
  Filter,
  Tag,
  FolderOpen,
  Palette,
  FileText,
} from 'lucide-react'
import type { Artwork } from '../../types/artwork'
import { diffPrompts, diffTags } from '../../core/promptDiff'
import { diffPalettes } from '../../core/paletteDiff'
import { useTransientValue } from '../../hooks/useCopyFeedback'

interface ComparisonSidebarProps {
  artworkA: Artwork
  artworkB: Artwork
  selectedColors: string[]
  onToggleColor: (hex: string) => void
  onSearchTag: (tag: string) => void
  folderNameMap?: Record<string, string>
  onSelectFolder?: (folderId: string | null) => void
  onClose: () => void
  onSwapCompare?: () => void
  onClearCompare?: () => void
}

function parseItemIdentifier(artwork: Artwork) {
  if (artwork.libraryId && artwork.rawId) {
    return { lib: artwork.libraryId, rawId: artwork.rawId }
  }
  const id = artwork.id
  if (id.startsWith('google-flow-')) {
    return { lib: 'google-flow', rawId: id.slice('google-flow-'.length) }
  }
  if (id.startsWith('design-')) {
    return { lib: 'design', rawId: id.slice('design-'.length) }
  }
  return { lib: artwork.libraryId || 'design', rawId: artwork.rawId || id }
}

async function callItemAction(action: 'reveal' | 'info', rawId: string, lib: string) {
  const res = await fetch(
    `/api/catalog/item-action?action=${action}&id=${encodeURIComponent(rawId)}&library=${encodeURIComponent(lib)}`
  )
  return res.json()
}

const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-400'

export const ComparisonSidebar: React.FC<ComparisonSidebarProps> = ({
  artworkA,
  artworkB,
  selectedColors,
  onToggleColor,
  onSearchTag,
  onClose,
  onSwapCompare,
  onClearCompare,
}) => {
  const [copiedKey, flashCopied] = useTransientValue<string>(2000)

  // Compute diffs
  const paletteDiff = diffPalettes(artworkA, artworkB)
  const promptDiff = diffPrompts(artworkA.culture, artworkB.culture)
  const tagDiff = diffTags(artworkA.artist, artworkB.artist)

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flashCopied(key)
    } catch {
      // Ignore clipboard error
    }
  }

  const handleRunItemAction = async (action: 'reveal' | 'info', artwork: Artwork, key: string) => {
    const { rawId, lib } = parseItemIdentifier(artwork)
    try {
      const data = await callItemAction(action, rawId, lib)
      if (action === 'info' && data.filePath) {
        await navigator.clipboard.writeText(data.filePath)
      }
      flashCopied(key)
    } catch {
      // Ignore network errors
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top Comparison Header */}
      <div className="flex flex-col gap-2 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-medium bg-amber-500/15 text-zinc-200 border border-zinc-700/80">
              <Sparkles className="w-3 h-3 text-zinc-200" />
              Comparação Lado a Lado
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onSwapCompare && (
              <button
                onClick={onSwapCompare}
                title="Inverter Ref A e Ref B (Atalho: X)"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs transition-all cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-white" />
                <span>Inverter (X)</span>
              </button>
            )}
            {onClearCompare && (
              <button
                onClick={onClearCompare}
                title="Fechar modo de comparação"
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Side-by-Side Mini Reference Cards */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {/* Card Ref A */}
          <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-200 font-semibold">REF A (BASE)</span>
              <span className="text-zinc-500">{artworkA.source}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <img
                src={artworkA.thumbnailUrl}
                alt={artworkA.title}
                className="w-8 h-8 rounded object-cover border border-zinc-800 shrink-0"
              />
              <span className="text-xs text-zinc-200 font-medium line-clamp-2 leading-snug">
                {artworkA.title}
              </span>
            </div>
          </div>

          {/* Card Ref B */}
          <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-200 font-semibold">REF B (COMPARAÇÃO)</span>
              <span className="text-zinc-500">{artworkB.source}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <img
                src={artworkB.thumbnailUrl}
                alt={artworkB.title}
                className="w-8 h-8 rounded object-cover border border-zinc-800 shrink-0"
              />
              <span className="text-xs text-zinc-200 font-medium line-clamp-2 leading-snug">
                {artworkB.title}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* -- Section 1: Color Harmony & Palette Diff ----------------------- */}
      <div className="flex flex-col gap-2.5 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <h3 className={sectionTitle}>Harmonia Cromática</h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">CIELAB D65</span>
        </div>

        {/* Harmony Metric Banner */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white font-mono">
                {paletteDiff.harmonyScore}%
              </span>
              <span className="text-xs text-zinc-300 font-medium">
                {paletteDiff.harmonyLabel}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Distância perceptual ΔE = {paletteDiff.dominantDistance}
            </span>
          </div>

          {/* Mini Dual Swatch Comparison */}
          <div className="flex items-center gap-1">
            <div
              className="w-6 h-6 rounded-md shadow-inner border border-white/20"
              style={{ backgroundColor: paletteDiff.dominantA }}
              title={`Ref A: ${paletteDiff.dominantA}`}
            />
            <ArrowLeftRight className="w-3 h-3 text-zinc-600" />
            <div
              className="w-6 h-6 rounded-md shadow-inner border border-white/20"
              style={{ backgroundColor: paletteDiff.dominantB }}
              title={`Ref B: ${paletteDiff.dominantB}`}
            />
          </div>
        </div>

        {/* Stacked Visual Palette Strips */}
        <div className="flex flex-col gap-1.5 mt-1">
          {/* Strip A */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-zinc-200">Paleta Ref A</span>
            <div className="flex h-3 w-full rounded-full overflow-hidden border border-zinc-800">
              {paletteDiff.paletteA.map(hex => (
                <div
                  key={`palA-${hex}`}
                  className="flex-1 h-full hover:flex-[1.5] transition-all cursor-pointer"
                  style={{ backgroundColor: hex }}
                  onClick={() => handleCopyText(hex, `hex-A-${hex}`)}
                  title={`${hex.toUpperCase()} (Ref A)`}
                />
              ))}
            </div>
          </div>

          {/* Strip B */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-zinc-200">Paleta Ref B</span>
            <div className="flex h-3 w-full rounded-full overflow-hidden border border-zinc-800">
              {paletteDiff.paletteB.map(hex => (
                <div
                  key={`palB-${hex}`}
                  className="flex-1 h-full hover:flex-[1.5] transition-all cursor-pointer"
                  style={{ backgroundColor: hex }}
                  onClick={() => handleCopyText(hex, `hex-B-${hex}`)}
                  title={`${hex.toUpperCase()} (Ref B)`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Closest Color Pairs List */}
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase">
            Correspondência de Tons mais Próximos
          </span>
          <div className="grid grid-cols-1 gap-1.5">
            {paletteDiff.closestPairs.slice(0, 4).map((pair, idx) => {
              const isSelectedA = selectedColors.some(
                c => c.toLowerCase() === pair.colorA.toLowerCase()
              )
              const isSelectedB = selectedColors.some(
                c => c.toLowerCase() === pair.colorB.toLowerCase()
              )

              return (
                <div
                  key={`pair-${idx}`}
                  className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs"
                >
                  {/* Swatch A */}
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-md border border-white/10 shrink-0"
                      style={{ backgroundColor: pair.colorA }}
                    />
                    <span className="font-mono text-[11px] text-zinc-300">
                      {pair.colorA.toUpperCase()}
                    </span>
                  </div>

                  {/* Affinity Badge */}
                  <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                    <span>ΔE {pair.distance}</span>
                    <ArrowLeftRight className="w-2.5 h-2.5 text-zinc-500" />
                  </div>

                  {/* Swatch B */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-300">
                      {pair.colorB.toUpperCase()}
                    </span>
                    <span
                      className="w-5 h-5 rounded-md border border-white/10 shrink-0"
                      style={{ backgroundColor: pair.colorB }}
                    />
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleColor(pair.colorA)}
                      title="Filtrar por tom de A"
                      className={`p-1 rounded-md text-[10px] cursor-pointer ${
                        isSelectedA
                          ? 'bg-zinc-700 text-zinc-200'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onToggleColor(pair.colorB)}
                      title="Filtrar por tom de B"
                      className={`p-1 rounded-md text-[10px] cursor-pointer ${
                        isSelectedB
                          ? 'bg-zinc-700 text-zinc-100'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* -- Section 2: Prompts / Annotation Diff ------------------------- */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            <h3 className={sectionTitle}>Diff de Prompts & Anotações</h3>
          </div>
          {promptDiff.hasPrompts && (
            <span className="text-[10px] font-mono text-zinc-500">
              {Math.round(promptDiff.similarityRatio * 100)}% afinidade
            </span>
          )}
        </div>

        {promptDiff.hasPrompts ? (
          <div className="flex flex-col gap-3">
            {/* Shared Terms Pills */}
            {promptDiff.sharedTerms.length > 0 && (
              <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-emerald-300 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" />
                    Termos Compartilhados ({promptDiff.sharedTerms.length})
                  </span>
                  <button
                    onClick={() =>
                      handleCopyText(promptDiff.sharedTerms.join(', '), 'copy-shared-terms')
                    }
                    className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-200 cursor-pointer"
                  >
                    {copiedKey === 'copy-shared-terms' ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar termos</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {promptDiff.sharedTerms.map(term => (
                    <span
                      key={`shared-${term}`}
                      className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 text-[10px] font-mono"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Prompt A with highlights */}
            {artworkA.culture && artworkA.culture !== 'Local Asset' && (
              <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-200">PROMPT REF A</span>
                  <button
                    onClick={() => handleCopyText(artworkA.culture || '', 'copy-prompt-A')}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                  >
                    {copiedKey === 'copy-prompt-A' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copiar</span>
                  </button>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed max-h-32 overflow-y-auto pr-1 whitespace-pre-wrap break-words">
                  {promptDiff.spansA.map((span, idx) => (
                    <span
                      key={`spanA-${idx}`}
                      className={
                        span.type === 'shared'
                          ? 'bg-emerald-500/25 text-emerald-200 font-medium rounded-xs px-0.5'
                          : ''
                      }
                    >
                      {span.text}
                    </span>
                  ))}
                </p>
              </div>
            )}

            {/* Prompt B with highlights */}
            {artworkB.culture && artworkB.culture !== 'Local Asset' && (
              <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-200">PROMPT REF B</span>
                  <button
                    onClick={() => handleCopyText(artworkB.culture || '', 'copy-prompt-B')}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                  >
                    {copiedKey === 'copy-prompt-B' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copiar</span>
                  </button>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed max-h-32 overflow-y-auto pr-1 whitespace-pre-wrap break-words">
                  {promptDiff.spansB.map((span, idx) => (
                    <span
                      key={`spanB-${idx}`}
                      className={
                        span.type === 'shared'
                          ? 'bg-emerald-500/25 text-emerald-200 font-medium rounded-xs px-0.5'
                          : ''
                      }
                    >
                      {span.text}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-[11px] text-zinc-500 italic">
            Nenhum prompt registrado para estas referências.
          </div>
        )}
      </div>

      {/* -- Section 3: Tag Diff ------------------------------------------ */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-zinc-400" />
            <h3 className={sectionTitle}>Diff de Tags & Categorias</h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            {tagDiff.overlapPercentage}% sobreposição
          </span>
        </div>

        {/* Shared Tags */}
        {tagDiff.sharedTags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Tags em Comum ({tagDiff.sharedTags.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tagDiff.sharedTags.map(tag => (
                <button
                  key={`shared-tag-${tag}`}
                  onClick={() => {
                    onSearchTag(tag.startsWith('#') ? tag : `#${tag}`)
                    onClose()
                  }}
                  className="px-2 py-0.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 text-xs transition-all cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unique to A */}
        {tagDiff.onlyATags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-zinc-200">
              Exclusivas da Ref A ({tagDiff.onlyATags.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tagDiff.onlyATags.map(tag => (
                <button
                  key={`onlyA-tag-${tag}`}
                  onClick={() => {
                    onSearchTag(tag.startsWith('#') ? tag : `#${tag}`)
                    onClose()
                  }}
                  className="px-2 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 text-xs transition-all cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unique to B */}
        {tagDiff.onlyBTags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-zinc-200">
              Exclusivas da Ref B ({tagDiff.onlyBTags.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tagDiff.onlyBTags.map(tag => (
                <button
                  key={`onlyB-tag-${tag}`}
                  onClick={() => {
                    onSearchTag(tag.startsWith('#') ? tag : `#${tag}`)
                    onClose()
                  }}
                  className="px-2 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 text-xs transition-all cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {tagDiff.sharedTags.length === 0 &&
          tagDiff.onlyATags.length === 0 &&
          tagDiff.onlyBTags.length === 0 && (
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-[11px] text-zinc-500 italic">
              Nenhuma tag cadastrada nas referências comparadas.
            </div>
          )}
      </div>

      {/* -- Section 4: Dual Item Actions -------------------------------- */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-800/80">
        <h3 className={sectionTitle}>Ações no Sistema</h3>

        <div className="grid grid-cols-2 gap-2">
          {/* Ref A Actions */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-zinc-200">Ref A</span>
            <button
              onClick={() => handleRunItemAction('reveal', artworkA, 'reveal-A')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-all cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{copiedKey === 'reveal-A' ? 'Aberto!' : 'Explorer'}</span>
            </button>
            <button
              onClick={() => handleRunItemAction('info', artworkA, 'info-A')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedKey === 'info-A' ? 'Copiado!' : 'Caminho'}</span>
            </button>
          </div>

          {/* Ref B Actions */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-zinc-200">Ref B</span>
            <button
              onClick={() => handleRunItemAction('reveal', artworkB, 'reveal-B')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-all cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{copiedKey === 'reveal-B' ? 'Aberto!' : 'Explorer'}</span>
            </button>
            <button
              onClick={() => handleRunItemAction('info', artworkB, 'info-B')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedKey === 'info-B' ? 'Copiado!' : 'Caminho'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


