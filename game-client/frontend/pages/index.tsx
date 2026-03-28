import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Gamepad2, LayoutGrid, Minus, Search, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import {
  GetComputerName,
  GetWindowsStartupStatus,
  LaunchGame,
  LoadManagerCategoriesJSON,
  LoadManagerGamesJSON,
  LoadManagerQuickAccessJSON,
  LoadManagerSettingsJSON,
  ReadManagerImageDataURL,
} from '../wailsjs/wailsjs/go/main/App'
import { BrowserOpenURL, Quit, WindowMinimise } from '../wailsjs/wailsjs/runtime/runtime'
import { cn } from '../lib/utils'

type ManagerGame = {
  id: number
  name: string
  exePath?: string
  args?: string
  category: string
  tags: string[]
  coverRelPath?: string
  exeIconRelPath?: string
}

type ManagerCategory = { name: string; iconRelPath?: string }

type CategoryTabItem = { key: string; label: string; iconRelPath?: string }
type IconSize = 'small' | 'medium' | 'large'

type ManagerSettings = {
  shopName?: string
  gameOrder?: 'A-Z' | 'Z-A'
  whenLaunchingGame?: 'minimized' | 'normal' | 'exit'
  gameIconSize?: IconSize
  categoryPosition?: string
  quickAccessPosition?: string
  tagsPosition?: string
  showTags?: boolean
  showQuickAccess?: boolean
  showQuickAccessTitle?: boolean
  showFooter?: boolean
  runningText?: string
  backgroundImage?: string
  logoImage?: string
  themeFamilyId?: string
  themeAppearance?: 'dark' | 'light'
}

function parseMulti(csv: string | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const imageCache = new Map<string, string>()
const categoryIconCache = new Map<string, string>()
type ThemeAppearance = 'dark' | 'light'
type ThemePalette = {
  appBackground: string
  panel: string
  panelAlt: string
  border: string
  text: string
  muted: string
  primary: string
  primaryHover: string
}

const palettes: Record<string, { dark: ThemePalette; light: ThemePalette }> = {
  'vs-blue': {
    dark: {
      appBackground: '#08143a',
      panel: '#10254a',
      panelAlt: '#27384f',
      border: '#27385a',
      text: '#ecf3ff',
      muted: '#a8b7d9',
      primary: '#3B82F6',
      primaryHover: '#2563EB',
    },
    light: {
      appBackground: '#eef4ff',
      panel: '#d8e6ff',
      panelAlt: '#cbdcff',
      border: '#b4c8ef',
      text: '#1d2f50',
      muted: '#4f6487',
      primary: '#2563EB',
      primaryHover: '#1D4ED8',
    },
  },
  'vs-teal': {
    dark: {
      appBackground: '#0F1419',
      panel: '#172026',
      panelAlt: '#20303A',
      border: '#334853',
      text: '#ECF3F8',
      muted: '#93A6B3',
      primary: '#14B8A6',
      primaryHover: '#0D9488',
    },
    light: {
      appBackground: '#F3F8F7',
      panel: '#FAFDFC',
      panelAlt: '#FFFFFF',
      border: '#C5D5D2',
      text: '#152320',
      muted: '#5C6F6C',
      primary: '#0F766E',
      primaryHover: '#0D5C56',
    },
  },
  'vs-purple': {
    dark: {
      appBackground: '#11111B',
      panel: '#1B1B2A',
      panelAlt: '#2A2A40',
      border: '#3E3E5A',
      text: '#F5F3FF',
      muted: '#A8A3C2',
      primary: '#8B5CF6',
      primaryHover: '#7C3AED',
    },
    light: {
      appBackground: '#FAFAFF',
      panel: '#FFFFFF',
      panelAlt: '#FFFFFF',
      border: '#D4D2E8',
      text: '#1E1B2E',
      muted: '#6B6680',
      primary: '#6D28D9',
      primaryHover: '#5B21B6',
    },
  },
  'monokai-classic': {
    dark: {
      appBackground: '#272822',
      panel: '#2D2E27',
      panelAlt: '#3A3B36',
      border: '#5B5C57',
      text: '#F8F8F2',
      muted: '#A6A28C',
      primary: '#F92672',
      primaryHover: '#E91E63',
    },
    light: {
      appBackground: '#F5F1E8',
      panel: '#EFE9DD',
      panelAlt: '#FFFCF5',
      border: '#C9C2B2',
      text: '#3A3D2E',
      muted: '#6B6658',
      primary: '#C4154B',
      primaryHover: '#A91242',
    },
  },
  'monokai-pro': {
    dark: {
      appBackground: '#2D2A2E',
      panel: '#221F22',
      panelAlt: '#363337',
      border: '#5B595C',
      text: '#FCFCFA',
      muted: '#A9A7A9',
      primary: '#AB9DF2',
      primaryHover: '#9A8AE6',
    },
    light: {
      appBackground: '#F7F5F2',
      panel: '#EFEBE7',
      panelAlt: '#FFFBF8',
      border: '#CBC6C0',
      text: '#2E2B28',
      muted: '#6F6A66',
      primary: '#6B5BC9',
      primaryHover: '#5849B0',
    },
  },
  'monokai-octagon': {
    dark: {
      appBackground: '#282A36',
      panel: '#21222C',
      panelAlt: '#303241',
      border: '#44475A',
      text: '#F8F8F2',
      muted: '#A4A7B4',
      primary: '#FFB86C',
      primaryHover: '#FFA94D',
    },
    light: {
      appBackground: '#F0F2F5',
      panel: '#E8EAEF',
      panelAlt: '#FFFFFF',
      border: '#C5CAD5',
      text: '#282A33',
      muted: '#5E6470',
      primary: '#D97706',
      primaryHover: '#B45309',
    },
  },
  gruvbox: {
    dark: {
      appBackground: '#282828',
      panel: '#1D2021',
      panelAlt: '#32302F',
      border: '#504945',
      text: '#EBDBB2',
      muted: '#BDAE93',
      primary: '#D79921',
      primaryHover: '#B57614',
    },
    light: {
      appBackground: '#FBF1C7',
      panel: '#F2E5BC',
      panelAlt: '#F9F5D7',
      border: '#D5C4A1',
      text: '#3C3836',
      muted: '#665C54',
      primary: '#B57614',
      primaryHover: '#9D6308',
    },
  },
  dracula: {
    dark: {
      appBackground: '#282A36',
      panel: '#303447',
      panelAlt: '#343746',
      border: '#44475A',
      text: '#F8F8F2',
      muted: '#B6B9C8',
      primary: '#BD93F9',
      primaryHover: '#A67DE8',
    },
    light: {
      appBackground: '#f3f4f9',
      panel: '#e7eaf5',
      panelAlt: '#dfe3f0',
      border: '#c9d1e2',
      text: '#343746',
      muted: '#62677E',
      primary: '#7C5ECF',
      primaryHover: '#6B4BC4',
    },
  },
  nord: {
    dark: {
      appBackground: '#2E3440',
      panel: '#3B4252',
      panelAlt: '#434C5E',
      border: '#4C566A',
      text: '#ECEFF4',
      muted: '#D8DEE9',
      primary: '#5E81AC',
      primaryHover: '#4C6F99',
    },
    light: {
      appBackground: '#ECEFF4',
      panel: '#E5E9F0',
      panelAlt: '#FFFFFF',
      border: '#D8DEE9',
      text: '#2E3440',
      muted: '#4C566A',
      primary: '#5E81AC',
      primaryHover: '#4C6F99',
    },
  },
}

function hexToRgbChannels(hex: string): string {
  const value = hex.trim().replace(/^#/, '')
  if (value.length === 3) {
    const [r, g, b] = value.split('')
    return `${parseInt(r + r, 16)} ${parseInt(g + g, 16)} ${parseInt(b + b, 16)}`
  }
  if (value.length !== 6) return '0 0 0'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

function applyTheme(themeFamilyId?: string, appearance?: ThemeAppearance) {
  const family = palettes[themeFamilyId || 'vs-blue'] ?? palettes['vs-blue']
  const mode: ThemeAppearance = appearance === 'light' ? 'light' : 'dark'
  const palette = family[mode]
  const root = document.documentElement.style
  root.setProperty('--color-app-background', hexToRgbChannels(palette.appBackground))
  root.setProperty('--color-sidebar', hexToRgbChannels(palette.panel))
  root.setProperty('--color-card', hexToRgbChannels(palette.panelAlt))
  root.setProperty('--color-border', hexToRgbChannels(palette.border))
  root.setProperty('--color-text', hexToRgbChannels(palette.text))
  root.setProperty('--color-muted-text', hexToRgbChannels(palette.muted))
  root.setProperty('--color-primary-button', hexToRgbChannels(palette.primary))
  root.setProperty('--color-hovered-primary-button', hexToRgbChannels(palette.primaryHover))
  root.setProperty('--color-secondary-button', hexToRgbChannels(palette.panelAlt))
  root.setProperty('--color-hovered-secondary-button', hexToRgbChannels(palette.panel))
  root.setProperty('--color-secondary-accent', hexToRgbChannels(palette.primary))
  root.setProperty('--color-secondary-text', hexToRgbChannels(palette.muted))
  root.setProperty('--gc-app-bg', palette.appBackground)
  root.setProperty('--gc-panel', palette.panel)
  root.setProperty('--gc-panel-alt', palette.panelAlt)
  root.setProperty('--gc-border', palette.border)
  root.setProperty('--gc-text', palette.text)
  root.setProperty('--gc-muted', palette.muted)
  root.setProperty('--gc-primary', palette.primary)
  root.setProperty('--gc-primary-hover', palette.primaryHover)
}

function normalizePos(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim().toLowerCase()
  switch (v) {
    case 'top-left':
    case 'top-center':
    case 'top-right':
    case 'bottom-left':
    case 'bottom-center':
    case 'bottom-right':
    case 'center-left':
    case 'center-right':
      return v
    default:
      return fallback
  }
}

function tabsPosClass(pos: string): string {
  switch (pos) {
    case 'top-center': return 'justify-center'
    case 'top-right': return 'justify-end'
    case 'center-left': return 'flex-col flex-nowrap items-start justify-start'
    case 'center-right': return 'flex-col flex-nowrap items-end justify-start'
    case 'bottom-left': return 'justify-start'
    case 'bottom-center': return 'justify-center'
    case 'bottom-right': return 'justify-end'
    default: return 'justify-start'
  }
}

function isCategoryTop(pos: string): boolean {
  return pos.startsWith('top')
}

function isCategoryBottom(pos: string): boolean {
  return pos.startsWith('bottom')
}

function isCategoryCenterLeft(pos: string): boolean {
  return pos === 'center-left'
}

function isCategoryCenterRight(pos: string): boolean {
  return pos === 'center-right'
}

function categoryTabRowClass(tabAlign: 'bar' | 'left' | 'right'): string {
  switch (tabAlign) {
    case 'left':
      return 'flex w-full min-w-0 items-center justify-start gap-2'
    case 'right':
      return 'flex w-full min-w-0 items-center justify-end gap-2'
    default:
      return 'flex min-w-0 items-center gap-2'
  }
}

function CategoryTabIcon({ relPath }: { relPath?: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const p = relPath?.trim()
    if (!p) {
      setSrc(null)
      return
    }
    const cached = categoryIconCache.get(p)
    if (cached) {
      setSrc(cached)
      return
    }
    void ReadManagerImageDataURL(p).then((data) => {
      if (cancelled || !data) return
      categoryIconCache.set(p, data)
      setSrc(data)
    })
    return () => {
      cancelled = true
    }
  }, [relPath])

  const p = relPath?.trim()
  if (!p) {
    return <FolderOpen className="h-4 w-4 shrink-0 text-theme-muted" aria-hidden />
  }
  if (!src) {
    return <FolderOpen className="h-4 w-4 shrink-0 text-theme-muted opacity-50" aria-hidden />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
  )
}

function CategoryTabLabel({ tab, tabAlign }: { tab: CategoryTabItem; tabAlign: 'bar' | 'left' | 'right' }) {
  return (
    <span className={categoryTabRowClass(tabAlign)}>
      {tab.key === 'ALL' ? (
        <LayoutGrid className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      ) : (
        <CategoryTabIcon relPath={tab.iconRelPath} />
      )}
      <span className="truncate">{tab.label}</span>
    </span>
  )
}

function tagPosClass(pos: string): string {
  switch (pos) {
    case 'top-center': return 'top-1.5 left-1/2 -translate-x-1/2 justify-center'
    case 'top-right': return 'top-1.5 right-1.5 justify-end'
    case 'center-left': return 'top-1/2 left-1.5 -translate-y-1/2 justify-start'
    case 'center-right': return 'top-1/2 right-1.5 -translate-y-1/2 justify-end'
    case 'bottom-left': return 'bottom-1.5 left-1.5 justify-start'
    case 'bottom-center': return 'bottom-1.5 left-1/2 -translate-x-1/2 justify-center'
    case 'bottom-right': return 'bottom-1.5 right-1.5 justify-end'
    default: return 'top-1.5 left-1.5 justify-start'
  }
}

function iconOnlyImageClass(iconSize: IconSize): string {
  switch (iconSize) {
    case 'small':
      return 'h-[3.125rem] w-[3.125rem] object-fill'
    case 'large':
      return 'max-h-[7rem] max-w-[7rem] object-contain'
    default:
      return 'max-h-[5.5rem] max-w-[5.5rem] object-contain'
  }
}

function GameArtwork({
  game,
  iconSize,
  tagsPosition,
  showTags,
  className
}: {
  game: ManagerGame
  iconSize: IconSize
  tagsPosition: string
  showTags: boolean
  className?: string
}) {
  const [src, setSrc] = useState('')

  const coverTrim = game.coverRelPath?.trim()
  const exeTrim = game.exeIconRelPath?.trim()

  const usesCoverArt =
    iconSize !== 'small' && !!coverTrim

  useEffect(() => {
    let cancelled = false
    async function run() {
      const relPath =
        iconSize === 'small'
          ? exeTrim
          : coverTrim || exeTrim || undefined
      if (!relPath) {
        setSrc('')
        return
      }
      const cached = imageCache.get(relPath)
      if (cached) {
        setSrc(cached)
        return
      }
      const data = await ReadManagerImageDataURL(relPath)
      if (cancelled) return
      if (data) imageCache.set(relPath, data)
      setSrc(data || '')
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [coverTrim, exeTrim, iconSize])

  const cls =
    iconSize === 'small'
      ? 'h-[3.125rem] w-[3.125rem]'
      : iconSize === 'large'
        ? 'h-[220px] w-[160px]'
        : 'h-[180px] w-[132px]'

  const containerClass = cn(
    'rounded-md border border-theme-border bg-theme-sidebar flex items-center justify-center overflow-hidden',
    cls,
    className
  )

  const coverImgClass = 'h-full w-full object-cover'
  const iconImgClass = cn('shrink-0', iconOnlyImageClass(iconSize))

  if (src) {
    return (
      <div className="relative">
        <div className={containerClass}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={game.name}
            className={usesCoverArt ? coverImgClass : iconImgClass}
          />
        </div>
        {showTags && game.tags?.length ? (
          <div className={`absolute flex max-w-[90%] flex-wrap gap-1 ${tagPosClass(tagsPosition)}`}>
            {game.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className="rounded-full border border-theme-border bg-theme-sidebar/85 px-1.5 py-1 text-[10px] leading-none text-theme-text">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className={containerClass}>
        <div className="text-2xl font-bold text-theme-muted">{game.name.slice(0, 1).toUpperCase()}</div>
      </div>
      {showTags && iconSize !== 'small' && game.tags?.length ? (
        <div className={`absolute flex max-w-[90%] flex-wrap gap-1 ${tagPosClass(tagsPosition)}`}>
          {game.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} className="rounded-full border border-theme-border bg-theme-sidebar/85 px-1.5 py-1 text-[10px] leading-none text-theme-text">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function Home() {
  const [games, setGames] = useState<ManagerGame[]>([])
  const [categories, setCategories] = useState<ManagerCategory[]>([])
  const [quickAccessIds, setQuickAccessIds] = useState<number[]>([])
  const [settings, setSettings] = useState<ManagerSettings>({})
  const [activeTab, setActiveTab] = useState('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [computerName, setComputerName] = useState('COMPUTER')
  const [backgroundImageSrc, setBackgroundImageSrc] = useState('')
  const [logoImageSrc, setLogoImageSrc] = useState('')
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [launchDialog, setLaunchDialog] = useState<{
    title: string
    message: string
    iconSrc?: string
    gameName?: string
  } | null>(null)
  const [windowsStartupStatus, setWindowsStartupStatus] = useState<'on' | 'off' | ''>('')

  useEffect(() => {
    void GetWindowsStartupStatus()
      .then((s) => {
        if (s === 'on' || s === 'off') setWindowsStartupStatus(s)
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const [gamesJson, categoriesJson, quickJson, settingsJson] = await Promise.all([
        LoadManagerGamesJSON(),
        LoadManagerCategoriesJSON(),
        LoadManagerQuickAccessJSON(),
        LoadManagerSettingsJSON(),
      ])
      void GetComputerName().then((n) => {
        if (!cancelled && n?.trim()) setComputerName(n.trim())
      })

      if (cancelled) return

      try {
        const parsedGames = JSON.parse(gamesJson) as ManagerGame[]
        setGames(Array.isArray(parsedGames) ? parsedGames : [])
      } catch {
        setGames([])
      }

      try {
        const parsedCategories = JSON.parse(categoriesJson) as ManagerCategory[]
        setCategories(Array.isArray(parsedCategories) ? parsedCategories : [])
      } catch {
        setCategories([])
      }

      try {
        const parsedQuick = JSON.parse(quickJson) as number[]
        setQuickAccessIds(Array.isArray(parsedQuick) ? parsedQuick.map(Number).filter((n) => Number.isFinite(n)) : [])
      } catch {
        setQuickAccessIds([])
      }

      try {
        const parsedSettings = JSON.parse(settingsJson) as ManagerSettings
        setSettings(parsedSettings && typeof parsedSettings === 'object' ? parsedSettings : {})
        if (typeof window !== 'undefined') {
          const s = parsedSettings && typeof parsedSettings === 'object' ? parsedSettings : {}
          applyTheme(s.themeFamilyId, s.themeAppearance)
        }
      } catch {
        setSettings({})
        if (typeof window !== 'undefined') applyTheme('vs-blue', 'dark')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const relPath = settings.backgroundImage?.trim()
      if (!relPath) {
        setBackgroundImageSrc('')
        return
      }
      const data = await ReadManagerImageDataURL(relPath)
      if (!cancelled) setBackgroundImageSrc(data || '')
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [settings.backgroundImage])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const relPath = settings.logoImage?.trim()
      if (!relPath) {
        setLogoImageSrc('')
        return
      }
      const data = await ReadManagerImageDataURL(relPath)
      if (!cancelled) setLogoImageSrc(data || '')
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [settings.logoImage])

  const iconSize: IconSize = settings.gameIconSize === 'small' || settings.gameIconSize === 'large' ? settings.gameIconSize : 'medium'
  const sortOrder = settings.gameOrder === 'Z-A' ? 'Z-A' : 'A-Z'
  const shopName = settings.shopName?.trim() || 'EZJR Menu'
  const categoryPosition = normalizePos(settings.categoryPosition, 'top-left')
  const quickAccessPosition = normalizePos(settings.quickAccessPosition, 'center-right')
  const tagsPosition = normalizePos(settings.tagsPosition, 'top-left')
  const showTags = settings.showTags !== false
  const showQuickAccess = settings.showQuickAccess !== false
  const showQuickAccessTitle = settings.showQuickAccessTitle !== false
  const showFooter = settings.showFooter !== false
  const whenLaunchingMode: 'minimized' | 'normal' | 'exit' =
    settings.whenLaunchingGame === 'minimized' ||
      settings.whenLaunchingGame === 'normal' ||
      settings.whenLaunchingGame === 'exit'
      ? settings.whenLaunchingGame
      : 'normal'

  function commitSearch() {
    setCommittedSearch(searchInput)
  }
  const quickIsLeft = quickAccessPosition.endsWith('left')
  const quickIsRight = quickAccessPosition.endsWith('right')
  const quickIsStackedTop = quickAccessPosition === 'top-center'
  const quickIsStackedBottom = quickAccessPosition === 'bottom-center'
  const quickIsStacked = quickIsStackedTop || quickIsStackedBottom

  const quickVerticalClass = quickAccessPosition.startsWith('top')
    ? 'items-start'
    : quickAccessPosition.startsWith('bottom')
      ? 'items-end'
      : 'items-center'

  // When Quick Access is stacked above/below, we always center it horizontally.
  const quickSlotAlignClass = quickIsStacked ? 'items-center' : quickVerticalClass

  const tabItems = useMemo((): CategoryTabItem[] => {
    const items: CategoryTabItem[] = [{ key: 'ALL', label: 'ALL' }]
    for (const c of categories) {
      const name = c.name.trim()
      if (!name) continue
      const icon = (c.iconRelPath ?? '').trim()
      items.push({
        key: name,
        label: name,
        iconRelPath: icon || undefined,
      })
    }
    return items
  }, [categories])

  const filteredGames = useMemo(() => {
    const query = committedSearch.trim().toLowerCase()
    const base = games.filter((g) => {
      if (activeTab !== 'ALL') {
        const cats = parseMulti(g.category)
        if (!cats.includes(activeTab)) return false
      }
      if (!query) return true
      return `${g.name} ${g.category} ${g.tags?.join(' ') ?? ''}`.toLowerCase().includes(query)
    })

    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return sortOrder === 'Z-A' ? sorted.reverse() : sorted
  }, [games, activeTab, committedSearch, sortOrder])

  const quickAccessGames = useMemo(() => {
    const map = new Map<number, ManagerGame>()
    games.forEach((g) => map.set(g.id, g))
    return quickAccessIds.map((id) => map.get(id)).filter(Boolean) as ManagerGame[]
  }, [games, quickAccessIds])

  /** In-app only: native MessageBox/TaskDialog in fullscreen WebView2 can crash the host with no visible prompt. */
  async function showLaunchError(title: string, message: string, game?: ManagerGame) {
    let iconSrc: string | undefined
    let gameName = game?.name?.trim()
    if (game) {
      const rel = (game.exeIconRelPath ?? '').trim() || (game.coverRelPath ?? '').trim()
      if (rel) {
        const cached = imageCache.get(rel)
        if (cached) {
          iconSrc = cached
        } else {
          const data = await ReadManagerImageDataURL(rel)
          if (data) {
            imageCache.set(rel, data)
            iconSrc = data
          }
        }
      }
    }
    setLaunchDialog({ title, message, iconSrc, gameName })
  }

  /** Runs only after a URL/game was started successfully — never on failed launch or missing path. */
  function applyAfterLaunchBehavior() {
    if (whenLaunchingMode === 'exit') {
      Quit()
    } else if (whenLaunchingMode === 'minimized') {
      WindowMinimise()
    }
  }

  async function handleLaunchGame(game: ManagerGame) {
    try {
      const exePath = (game.exePath ?? '').trim()
      if (!exePath) {
        await showLaunchError(
          'Unable to launch game',
          `"${game.name}" has no launch path configured. Add a launch path in Game Manager.`,
          game
        )
        return
      }

      if (/^https?:\/\//i.test(exePath)) {
        BrowserOpenURL(exePath)
        applyAfterLaunchBehavior()
        return
      }

      try {
        await LaunchGame(exePath, game.args ?? '')
        applyAfterLaunchBehavior()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to launch the selected game.'
        await showLaunchError('Unable to launch game', msg, game)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error while launching.'
      await showLaunchError('Unable to launch game', msg, game)
    }
  }

  const now = new Date();

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const date = now.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="relative isolate flex h-screen w-screen flex-col gap-3.5 overflow-hidden bg-theme-app bg-cover bg-center bg-no-repeat px-5 pb-3.5 pt-[18px] text-theme-text"
      style={backgroundImageSrc ? { backgroundImage: `url("${backgroundImageSrc}")` } : undefined}
    >
      <Head>
        <title>Game Menu</title>
      </Head>

      {backgroundImageSrc ? (
        <div className="pointer-events-none absolute inset-0 z-0 bg-theme-app/45 backdrop-blur-[2px]" />
      ) : null}

      <div className="relative z-10 grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <div className="flex min-w-0 items-center justify-self-start">
          {logoImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoImageSrc} alt={shopName} className="max-h-16 w-auto max-w-[320px] object-contain" />
          ) : (
            <div className="text-5xl font-bold text-theme-primary">{shopName}</div>
          )}
        </div>
        <div className="flex w-full max-w-[560px] items-center gap-2">
          <Input
            className="h-[42px] min-w-0 flex-1 rounded-[10px]"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitSearch()
              }
            }}
            placeholder="Search"
            aria-label="Search games"
          />
          <Button
            type="button"
            size="icon"
            className="h-[42px] w-[42px] shrink-0 rounded-[10px]"
            aria-label="Apply search"
            onClick={() => commitSearch()}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-self-end">
          <Button size='icon' className='!rounded-full bg-transparent text-theme-text' aria-label="Minimize" onClick={() => WindowMinimise()}>
            <Minus className="h-4 w-4" />
          </Button>
          <Button size='icon' className='!rounded-full bg-transparent text-theme-text hover:!bg-theme-error' aria-label="Close" onClick={() => Quit()}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={`relative z-10 flex min-h-0 flex-1 gap-4 ${quickIsStacked ? 'flex-col' : ''}`}>
        {showQuickAccess && quickIsStackedTop && quickAccessGames.length > 0 ? (
          <div className="flex w-full justify-center">
            <aside className="flex flex-col items-center gap-2">
              {showQuickAccessTitle ? <Badge className='!py-0.5 !border-none'>Quick Access</Badge> : null}
              <div className='flex items-center gap-2 bg-theme-secondary/50 rounded-lg p-1'>
                {quickAccessGames.map((g) => (
                  <Button
                    key={g.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto border-0 !p-1 hover:bg-transparent",
                      //selectedGameId === g.id ? 'rounded-md bg-theme-primary/20 ring-1 ring-theme-primary' : ''
                    )}
                    aria-label={g.name}
                    // onClick={() => setSelectedGameId(g.id)}
                    onDoubleClick={() => void handleLaunchGame(g)}
                  >
                    <GameArtwork className='!bg-transparent border-none' game={g} iconSize="small" tagsPosition={tagsPosition} showTags={false} />
                  </Button>
                ))}
              </div>
            </aside>
          </div>
        ) : null}

        {showQuickAccess && quickIsLeft && quickAccessGames.length > 0 ? (
          <div className={`order-[-1] flex ${quickSlotAlignClass}`}>
            <aside className="flex flex-col items-center gap-2">
              {showQuickAccessTitle ? <Badge className='!py-0.5 !border-none'>Quick Access</Badge> : null}
              <div className='flex flex-col items-center gap-2.5 bg-theme-secondary/50 rounded-lg p-1 w-full'>
                {quickAccessGames.map((g) => (
                  <Button
                    key={g.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto border-0 !p-1 hover:bg-transparent",
                      //selectedGameId === g.id ? 'rounded-md bg-theme-primary/20 ring-1 ring-theme-primary' : ''
                    )}
                    aria-label={g.name}
                    // onClick={() => setSelectedGameId(g.id)}
                    onDoubleClick={() => void handleLaunchGame(g)}
                  >
                    <GameArtwork className='!bg-transparent border-none' game={g} iconSize="small" tagsPosition={tagsPosition} showTags={false} />
                  </Button>
                ))}
              </div>
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {isCategoryTop(categoryPosition) ? (
              <div className={`mb-3.5 flex flex-wrap gap-2.5 ${tabsPosClass(categoryPosition)}`}>
                {tabItems.map((tab) => (
                  <Button
                    key={tab.key}
                    type="button"
                    variant={tab.key === activeTab ? 'default' : 'secondary'}
                    size="sm"
                    className={cn('', tab.key === activeTab ? '' : 'text-theme-muted')}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <CategoryTabLabel tab={tab} tabAlign="bar" />
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 gap-2.5">
              {isCategoryCenterLeft(categoryPosition) ? (
                <div className="mb-0 flex flex-col flex-nowrap items-start justify-start gap-2.5">
                  {tabItems.map((tab) => (
                    <Button
                      key={tab.key}
                      type="button"
                      variant={tab.key === activeTab ? 'default' : 'secondary'}
                      size="sm"
                      className={cn('w-full', tab.key === activeTab ? '' : 'text-theme-muted')}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      <CategoryTabLabel tab={tab} tabAlign="left" />
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-wrap content-start overflow-auto">
                {filteredGames.map((game) => (
                  <Button
                    key={game.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto flex-col items-center gap-2 border-0 bg-transparent !p-0 m-1 text-inherit hover:bg-transparent rounded-md",
                      // selectedGameId === game.id ? '!bg-theme-primary/20' : ''
                    )}
                    onClick={() => setSelectedGameId(game.id)}
                    onDoubleClick={() => void handleLaunchGame(game)}
                  >
                    <GameArtwork game={game} iconSize={iconSize} tagsPosition={tagsPosition} showTags={showTags} />
                    <div className={cn("max-w-40 text-center text-[13px] text-theme-text pb-2 text-wrap px-1",
                      // selectedGameId == game.id && '!text-theme-primary'
                    )}>{game.name}</div>
                  </Button>
                ))}
              </div>

              {isCategoryCenterRight(categoryPosition) ? (
                <div className="mb-0 flex flex-col flex-nowrap items-end justify-start gap-2.5">
                  {tabItems.map((tab) => (
                    <Button
                      key={tab.key}
                      type="button"
                      variant={tab.key === activeTab ? 'default' : 'secondary'}
                      size="sm"
                      className={cn('w-full', tab.key === activeTab ? '' : 'text-theme-muted')}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      <CategoryTabLabel tab={tab} tabAlign="right" />
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>

            {isCategoryBottom(categoryPosition) ? (
              <div className={`mb-3.5 flex flex-wrap gap-2.5 ${tabsPosClass(categoryPosition)}`}>
                {tabItems.map((tab) => (
                  <Button
                    key={tab.key}
                    type="button"
                    variant={tab.key === activeTab ? 'default' : 'secondary'}
                    size="sm"
                    className={cn('', tab.key === activeTab ? '' : 'text-theme-muted')}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <CategoryTabLabel tab={tab} tabAlign="bar" />
                  </Button>
                ))}
              </div>
            ) : null}
          </main>
        </div>

        {showQuickAccess && quickIsRight && quickAccessGames.length > 0 ? (
          <div className={`order-1 flex ${quickSlotAlignClass}`}>
            <aside className="flex flex-col items-center gap-2">
              <Badge className='!py-0.5 !border-none'>Quick Access</Badge>
              <div className='flex flex-col items-center gap-2 bg-theme-secondary/50 rounded-lg p-1 w-full'>
                {quickAccessGames.map((g) => (
                  <Button
                    key={g.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto border-0 !p-1 hover:bg-transparent",
                      //selectedGameId === g.id ? 'rounded-md bg-theme-primary/20 ring-1 ring-theme-primary' : ''
                    )}
                    aria-label={g.name}
                    // onClick={() => setSelectedGameId(g.id)}
                    onDoubleClick={() => void handleLaunchGame(g)}
                  >
                    <GameArtwork className='!bg-transparent border-none' game={g} iconSize="small" tagsPosition={tagsPosition} showTags={false} />
                  </Button>
                ))}
              </div>
            </aside>
          </div>
        ) : null}

        {showQuickAccess && quickIsStackedBottom && quickAccessGames.length > 0 ? (
          <div className="flex w-full justify-center">
            <aside className="flex flex-col items-center gap-2">
              {showQuickAccessTitle ? <Badge className='!py-0.5 !border-none'>Quick Access</Badge> : null}
              <div className='flex items-center gap-2 bg-theme-secondary/50 rounded-lg p-1'>
                {quickAccessGames.map((g) => (
                  <Button
                    key={g.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto border-0 !p-1 hover:bg-transparent",
                      //selectedGameId === g.id ? 'rounded-md bg-theme-primary/20 ring-1 ring-theme-primary' : ''
                    )}
                    aria-label={g.name}
                    // onClick={() => setSelectedGameId(g.id)}
                    onDoubleClick={() => void handleLaunchGame(g)}
                  >
                    <GameArtwork className='!bg-transparent border-none' game={g} iconSize="small" tagsPosition={tagsPosition} showTags={false} />
                  </Button>
                ))}
              </div>
            </aside>
          </div>
        ) : null}
      </div>

      {showFooter ? (
        <footer className="relative z-10 flex py-3 items-center gap-[18px] rounded-md bg-theme-sidebar/70 px-3">
          <span className="text-sm text-theme-primary font-bold">{computerName}</span>

          {/* {windowsStartupStatus ? (
            <span className="shrink-0 text-xs text-theme-muted" title="HKCU\Software\Microsoft\Windows\CurrentVersion\Run\EZJRGameClient">
              Startup: {windowsStartupStatus === 'on' ? 'On' : 'Off'}
            </span>
          ) : null} */}

          <div className="flex-1 overflow-hidden whitespace-nowrap text-theme-secondary-text font-normal text-sm">
            <span className="animate-[scrollText_20s_linear_infinite] inline-block pl-[100%]">
              {settings.runningText?.trim() || 'Powered by EZJR'}
            </span>
          </div>

          <span className="ml-auto text-theme-muted text-sm font-semibold">
            {`${time} ${date}`}
          </span>
        </footer>
      ) : null}

      <AlertDialog
        open={launchDialog !== null}
        onOpenChange={(open) => {
          if (!open) setLaunchDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex gap-4 sm:items-start">
              {launchDialog?.iconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={launchDialog.iconSrc}
                  alt={launchDialog.gameName ?? ''}
                  className="h-14 w-14 shrink-0 rounded-lg border border-theme-border bg-theme-sidebar object-cover"
                />
              ) : (
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-sidebar"
                  aria-hidden
                >
                  <Gamepad2 className="h-7 w-7 text-theme-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2 text-left">
                <AlertDialogTitle>{launchDialog?.title ?? ''}</AlertDialogTitle>
                <AlertDialogDescription className="whitespace-pre-wrap">
                  {launchDialog?.message ?? ''}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
