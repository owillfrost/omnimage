export type ShortcutContext = 'general' | 'viewer' | 'canvas' | 'explore' | 'search'

export interface ShortcutItem {
  id: string
  description: string
  keys: string[]
  context: ShortcutContext
}

export interface ShortcutGroup {
  context: ShortcutContext
  title: string
  items: ShortcutItem[]
}

/**
 * Single source of truth for all verified keyboard shortcuts and gestures in the application.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    context: 'general',
    title: 'GERAL',
    items: [
      {
        id: 'toggle-shortcuts',
        description: 'Abrir / fechar esta janela de atalhos',
        keys: ['?'],
        context: 'general',
      },
      {
        id: 'close-modal-or-clear',
        description: 'Fechar janela ativa / Limpar filtros e âncora',
        keys: ['Esc'],
        context: 'general',
      },
    ],
  },
  {
    context: 'viewer',
    title: 'VISUALIZADOR EM TELA CHEIA',
    items: [
      {
        id: 'viewer-prev',
        description: 'Imagem anterior do acervo',
        keys: ['←'],
        context: 'viewer',
      },
      {
        id: 'viewer-next',
        description: 'Próxima imagem do acervo',
        keys: ['→'],
        context: 'viewer',
      },
      {
        id: 'viewer-close',
        description: 'Fechar visualizador',
        keys: ['Esc'],
        context: 'viewer',
      },
      {
        id: 'viewer-drag',
        description: 'Arrastar e mover imagem (com zoom ativo)',
        keys: ['Arrastar'],
        context: 'viewer',
      },
      {
        id: 'viewer-scroll-similar',
        description: 'Rolar para baixo para ver imagens similares',
        keys: ['Scroll ↓'],
        context: 'viewer',
      },
      {
        id: 'viewer-zoom-levels',
        description: 'Alternar níveis de ampliação da imagem',
        keys: ['1x', '1.5x', '2.5x'],
        context: 'viewer',
      },
      {
        id: 'viewer-zoom-reset',
        description: 'Redefinir zoom para 1x e centralizar',
        keys: ['Reset'],
        context: 'viewer',
      },
      {
        id: 'viewer-pin-compare',
        description: 'Fixar obra para comparar lado a lado (Split A/B)',
        keys: ['P', 'Shift + Clique'],
        context: 'viewer',
      },
      {
        id: 'viewer-swap-split',
        description: 'Inverter posições no modo comparativo (A ↔ B)',
        keys: ['X'],
        context: 'viewer',
      },
      {
        id: 'viewer-unpin-split',
        description: 'Desafixar ou sair da comparação dividida',
        keys: ['Esc'],
        context: 'viewer',
      },
    ],
  },
  {
    context: 'canvas',
    title: 'CANVAS 2D ESPACIAL',
    items: [
      {
        id: 'canvas-drag-pan',
        description: 'Arrastar livremente no espaço 2D (com inércia)',
        keys: ['Botão esquerdo', 'Arrastar'],
        context: 'canvas',
      },
      {
        id: 'canvas-wheel-pan',
        description: 'Deslocamento bidirecional suave no grid (pan X/Y)',
        keys: ['Roda do mouse'],
        context: 'canvas',
      },
      {
        id: 'canvas-color-anchor',
        description: 'Selecionar imagem como âncora cromática (radial)',
        keys: ['Clique no card'],
        context: 'canvas',
      },
      {
        id: 'canvas-anchor-prev',
        description: 'Voltar para a âncora anterior no histórico (Rabbit Hole)',
        keys: ['Alt + ←'],
        context: 'canvas',
      },
      {
        id: 'canvas-anchor-next',
        description: 'Avançar para a próxima âncora no histórico',
        keys: ['Alt + →'],
        context: 'canvas',
      },
      {
        id: 'canvas-density',
        description: 'Alternar densidade do grid (Pequeno, Médio, Amplo)',
        keys: ['Controles de Grid'],
        context: 'canvas',
      },
      {
        id: 'canvas-shuffle',
        description: 'Embaralhar aleatoriamente a disposição das obras',
        keys: ['Shuffle'],
        context: 'canvas',
      },
      {
        id: 'canvas-recenter',
        description: 'Recentralizar câmera no ponto de origem',
        keys: ['Recenter'],
        context: 'canvas',
      },
    ],
  },
  {
    context: 'explore',
    title: 'FEED EXPLORAR',
    items: [
      {
        id: 'explore-scroll',
        description: 'Navegar pelo feed vertical infinito masonry',
        keys: ['Scroll ↑/↓'],
        context: 'explore',
      },
      {
        id: 'explore-open-card',
        description: 'Abrir imagem no visualizador completo de detalhes',
        keys: ['Clique no card'],
        context: 'explore',
      },
      {
        id: 'explore-back-to-top',
        description: 'Rolar instantaneamente de volta ao topo do feed',
        keys: ['Voltar ao Topo'],
        context: 'explore',
      },
    ],
  },
  {
    context: 'search',
    title: 'BUSCA & FILTROS',
    items: [
      {
        id: 'search-typing',
        description: 'Buscar por nome, tag, formato ou anotação de IA',
        keys: ['Digitar na busca'],
        context: 'search',
      },
      {
        id: 'color-palette-filter',
        description: 'Filtrar acervo por até 5 tons cromáticos (AND/OR)',
        keys: ['Paleta de Cores'],
        context: 'search',
      },
      {
        id: 'library-switch',
        description: 'Alternar entre as bibliotecas disponíveis',
        keys: ['Toggle Biblioteca'],
        context: 'search',
      },
      {
        id: 'media-filter-toggle',
        description: 'Alternar filtro rápido de mídias (Vídeos / Todas)',
        keys: ['V'],
        context: 'search',
      },
      {
        id: 'motion-scrubbing',
        description: 'Preview dinâmico e scrubbing quadro a quadro no card de vídeo',
        keys: ['Hover 350ms', 'Mover cursor'],
        context: 'search',
      },
    ],
  },
]
