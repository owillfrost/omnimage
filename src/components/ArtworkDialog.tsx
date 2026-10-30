import * as React from "react"
import type { Artwork } from "../types/artwork"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { ExternalLink, Download, Bookmark, Palette, Sparkles } from "lucide-react"
import { useI18n } from "../i18n"

interface ArtworkDialogProps {
  artwork: Artwork | null
  isOpen: boolean
  onClose: () => void
  onSelectColor?: (color: string) => void
  onOrganizeByColor?: (artwork: Artwork) => void
  isCurrentAnchor?: boolean
}

export const ArtworkDialog: React.FC<ArtworkDialogProps> = ({
  artwork,
  isOpen,
  onClose,
  onSelectColor,
  onOrganizeByColor,
  isCurrentAnchor,
}) => {
  const { t } = useI18n()
  if (!artwork) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden border-zinc-800 bg-zinc-950/95 max-h-[90vh] flex flex-col md:flex-row">
        {/* Left: High-Resolution Artwork Viewer */}
        <div className="relative flex-1 bg-black/60 flex items-center justify-center p-6 md:p-10 min-h-[340px] md:min-h-[540px] overflow-hidden">
          <div
            className="absolute inset-0 opacity-20 filter blur-3xl pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${artwork.dominantColor || '#ffffff'} 0%, transparent 70%)`,
            }}
          />
          <img
            src={artwork.imageUrl || artwork.thumbnailUrl}
            alt={artwork.title}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="relative z-10 max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-2xl select-none"
          />
        </div>

        {/* Right: Rich Provenance & Met Details */}
        <div className="w-full md:w-96 flex flex-col justify-between p-6 md:p-8 border-t md:border-t-0 md:border-l border-zinc-800/80 overflow-y-auto">
          <div className="space-y-6">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  {t('artworkDialog.yourReferences')}
                </span>
                <span className="text-[11px] text-zinc-500 font-medium">
                  {artwork.source}
                </span>
              </div>
              <DialogTitle className="text-xl md:text-2xl font-bold text-white leading-tight">
                {artwork.title}
              </DialogTitle>
              <p className="text-sm font-medium text-zinc-300">
                {artwork.artist}
              </p>
            </DialogHeader>

            {/* Metadata Grid */}
            <div className="space-y-3 border-t border-b border-zinc-800/70 py-4 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-zinc-500">{t('artworkDialog.date')}</span>
                <span className="text-zinc-200 font-medium">{artwork.date || 'Unknown'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-500">{t('artworkDialog.medium')}</span>
                <span className="text-zinc-200 font-medium text-right max-w-[180px] truncate">{artwork.medium}</span>
              </div>
              {artwork.culture && artwork.culture !== 'Local Asset' && (
                <div className="pt-2">
                  <span className="text-[11px] text-zinc-500 font-medium block mb-1">
                    {artwork.source.includes('Prompt') || artwork.source.includes('Google') ? t('artworkDialog.promptAnnotation') : t('artworkDialog.cultureNotes')}
                  </span>
                  <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                    {artwork.culture}
                  </div>
                </div>
              )}
              {artwork.department && (
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">{t('artworkDialog.department')}</span>
                  <span className="text-zinc-200 font-medium text-right max-w-[180px] truncate">{artwork.department}</span>
                </div>
              )}
            </div>

            {/* Chromatic Palette breakdown */}
            {artwork.palette && artwork.palette.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Palette className="w-3.5 h-3.5" />
                  <span>{t('artworkDialog.colorPalette')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {artwork.palette.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectColor?.(color)
                        onClose()
                      }}
                      className="group relative w-7 h-7 rounded-full border border-white/20 transition-all hover:border-white hover:ring-2 hover:ring-white/40 active:scale-95"
                      style={{ backgroundColor: color }}
                      title={t("artworkDialog.filterByColor", { color })}
                    >
                      <span className="sr-only">{color}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action CTAs */}
          <div className="space-y-2.5 pt-6 mt-4 border-t border-zinc-800/60">
            <Button
              variant="outline"
              className="w-full border-zinc-700 bg-zinc-900/90 text-zinc-100 hover:bg-zinc-800 hover:text-white h-11 font-medium transition-all"
              onClick={() => {
                onOrganizeByColor?.(artwork)
                onClose()
              }}
            >
              <Sparkles className="w-4 h-4 mr-2 text-amber-400" />
              {isCurrentAnchor ? t("artworkDialog.gridAlreadyHarmonized") : t("artworkDialog.harmonizeGrid")}
            </Button>

            <Button
              className="w-full bg-white text-black font-semibold hover:bg-zinc-200 h-11"
              onClick={() => alert(`Salvo "${artwork.title}" na sua coleção Omnimage!`)}
            >
              <Bookmark className="w-4 h-4 mr-2" />
              {t('artworkDialog.saveToOmnimage')}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={artwork.imageUrl || artwork.thumbnailUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {t('artworkDialog.downloadHd')}
              </a>

              <a
                href={artwork.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
              >
                <span>View on {artwork.source === 'The Met' ? 'The Met' : 'Archive'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
