import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import styles from './index.module.css'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  GetComputerName,
  LoadManagerCategoriesJSON,
  LoadManagerGamesJSON,
  LoadManagerQuickAccessJSON,
  LoadManagerSettingsJSON,
  ReadManagerImageDataURL,
} from '../wailsjs/wailsjs/go/main/App'

type ManagerGame = {
  id: number
  name: string
  category: string
  tags: string[]
  coverRelPath?: string
  exeIconRelPath?: string
}

type ManagerCategory = { name: string }
type IconSize = 'small' | 'medium' | 'large'

type ManagerSettings = {
  shopName?: string
  gameOrder?: 'A-Z' | 'Z-A'
  gameIconSize?: IconSize
  categoryPosition?: string
  quickAccessPosition?: string
  tagsPosition?: string
  showTags?: boolean
  showQuickAccess?: boolean
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

function applyTheme(themeFamilyId?: string, appearance?: ThemeAppearance) {
  const family = palettes[themeFamilyId || 'vs-blue'] ?? palettes['vs-blue']
  const mode: ThemeAppearance = appearance === 'light' ? 'light' : 'dark'
  const palette = family[mode]
  const root = document.documentElement.style
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
    case 'top-center': return styles.tabsPosTopCenter
    case 'top-right': return styles.tabsPosTopRight
    case 'center-left': return styles.tabsPosCenterLeft
    case 'center-right': return styles.tabsPosCenterRight
    case 'bottom-left': return styles.tabsPosBottomLeft
    case 'bottom-center': return styles.tabsPosBottomCenter
    case 'bottom-right': return styles.tabsPosBottomRight
    default: return styles.tabsPosTopLeft
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

function tagPosClass(pos: string): string {
  switch (pos) {
    case 'top-center': return styles.tagTopCenter
    case 'top-right': return styles.tagTopRight
    case 'center-left': return styles.tagCenterLeft
    case 'center-right': return styles.tagCenterRight
    case 'bottom-left': return styles.tagBottomLeft
    case 'bottom-center': return styles.tagBottomCenter
    case 'bottom-right': return styles.tagBottomRight
    default: return styles.tagTopLeft
  }
}

function GameArtwork({
  game,
  iconSize,
  tagsPosition,
  showTags,
}: {
  game: ManagerGame
  iconSize: IconSize
  tagsPosition: string
  showTags: boolean
}) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    async function run() {
      const relPath = iconSize === 'small' ? game.exeIconRelPath : game.coverRelPath
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
  }, [game.coverRelPath, game.exeIconRelPath, iconSize])

  const cls =
    iconSize === 'small'
      ? styles.smallIcon
      : iconSize === 'large'
        ? styles.largeCover
        : styles.mediumCover

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <div className={styles.artworkWrap}>
        <img src={src} alt={game.name} className={cls} />
        {showTags && game.tags?.length ? (
          <div className={`${styles.tagList} ${tagPosClass(tagsPosition)}`}>
            {game.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={styles.tagChip}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.artworkWrap}>
      <div className={cls}>
        <div className={styles.noImage}>{game.name.slice(0, 1).toUpperCase()}</div>
      </div>
      {showTags && iconSize !== 'small' && game.tags?.length ? (
        <div className={`${styles.tagList} ${tagPosClass(tagsPosition)}`}>
          {game.tags.slice(0, 3).map((tag) => (
            <span key={tag} className={styles.tagChip}>{tag}</span>
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
  const [search, setSearch] = useState('')
  const [computerName, setComputerName] = useState('COMPUTER')
  const [backgroundImageSrc, setBackgroundImageSrc] = useState('')
  const [logoImageSrc, setLogoImageSrc] = useState('')

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
  const shopName = settings.shopName?.trim() || 'LOGO'
  const categoryPosition = normalizePos(settings.categoryPosition, 'top-left')
  const quickAccessPosition = normalizePos(settings.quickAccessPosition, 'center-right')
  const tagsPosition = normalizePos(settings.tagsPosition, 'top-left')
  const showTags = settings.showTags !== false
  const showQuickAccess = settings.showQuickAccess !== false
  const quickIsLeft = quickAccessPosition.endsWith('left')
  const quickIsRight = quickAccessPosition.endsWith('right')
  const quickIsStackedTop = quickAccessPosition === 'top-center'
  const quickIsStackedBottom = quickAccessPosition === 'bottom-center'
  const quickIsStacked = quickIsStackedTop || quickIsStackedBottom

  const quickVerticalClass = quickAccessPosition.startsWith('top')
    ? styles.quickTop
    : quickAccessPosition.startsWith('bottom')
      ? styles.quickBottom
      : styles.quickCenter

  // When Quick Access is stacked above/below, we always center it horizontally.
  const quickSlotAlignClass = quickIsStacked ? styles.quickCenter : quickVerticalClass

  const tabs = useMemo(() => {
    const fromCategories = categories.map((c) => c.name.trim()).filter(Boolean)
    return ['ALL', ...fromCategories]
  }, [categories])

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase()
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
  }, [games, activeTab, search, sortOrder])

  const quickAccessGames = useMemo(() => {
    const map = new Map<number, ManagerGame>()
    games.forEach((g) => map.set(g.id, g))
    return quickAccessIds.map((id) => map.get(id)).filter(Boolean) as ManagerGame[]
  }, [games, quickAccessIds])

  return (
    <div
      className={styles.appContainer}
      style={backgroundImageSrc ? { backgroundImage: `url("${backgroundImageSrc}")` } : undefined}
    >
      <Head>
        <title>Game Menu</title>
      </Head>

      <div className={styles.topRow}>
        <div className={styles.logoWrap}>
          {logoImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoImageSrc} alt={shopName} className={styles.logoImage} />
          ) : (
            <div className={styles.logoText}>{shopName}</div>
          )}
        </div>
        <div className={styles.searchWrap}>
          <Input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
          />
        </div>
      </div>

      <div className={`${styles.contentRow} ${quickIsStacked ? styles.contentRowColumn : ''}`}>
        {showQuickAccess && quickIsStackedTop ? (
          <div className={`${styles.quickSlot} ${styles.quickSlotStack} ${styles.quickCenter}`}>
            <aside className={`${styles.quickAccessRail} ${styles.quickAccessRailRow}`}>
              <div className={styles.quickAccessLabel}>QUICK ACCESS</div>
              {quickAccessGames.map((g) => (
                <Button key={g.id} type="button" variant="ghost" className={styles.quickAccessItem} aria-label={g.name}>
                  <GameArtwork game={g} iconSize="small" tagsPosition={tagsPosition} showTags={showTags} />
                </Button>
              ))}
            </aside>
          </div>
        ) : null}

        {showQuickAccess && quickIsLeft ? (
          <div className={`${styles.quickSlot} ${styles.quickSlotLeft} ${quickSlotAlignClass}`}>
            <aside className={styles.quickAccessRail}>
              <div className={styles.quickAccessLabel}>QUICK ACCESS</div>
              {quickAccessGames.map((g) => (
                <Button key={g.id} type="button" variant="ghost" className={styles.quickAccessItem} aria-label={g.name}>
                  <GameArtwork game={g} iconSize="small" tagsPosition={tagsPosition} showTags={false} />
                </Button>
              ))}
            </aside>
          </div>
        ) : null}

        <div className={styles.mainContentContainer}>
          <main className={styles.mainArea}>
            {isCategoryTop(categoryPosition) ? (
              <div className={`${styles.tabs} ${tabsPosClass(categoryPosition)}`}>
                {tabs.map((tab) => (
                  <Button
                    key={tab}
                    type="button"
                    className={tab === activeTab ? styles.tabActive : styles.tab}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className={styles.mainBody}>
              {isCategoryCenterLeft(categoryPosition) ? (
                <div className={`${styles.tabs} ${styles.tabsPosCenterLeft}`}>
                  {tabs.map((tab) => (
                    <Button
                      key={tab}
                      type="button"
                      className={tab === activeTab ? styles.tabActive : styles.tab}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className={styles.gamesGrid}>
                {filteredGames.map((game) => (
                  <Button key={game.id} type="button" variant="ghost" className={styles.gameCard}>
                    <GameArtwork game={game} iconSize={iconSize} tagsPosition={tagsPosition} showTags={showTags} />
                    <div className={styles.gameName}>{game.name}</div>
                  </Button>
                ))}
              </div>

              {isCategoryCenterRight(categoryPosition) ? (
                <div className={`${styles.tabs} ${styles.tabsPosCenterRight}`}>
                  {tabs.map((tab) => (
                    <Button
                      key={tab}
                      type="button"
                      className={tab === activeTab ? styles.tabActive : styles.tab}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>

            {isCategoryBottom(categoryPosition) ? (
              <div className={`${styles.tabs} ${tabsPosClass(categoryPosition)}`}>
                {tabs.map((tab) => (
                  <Button
                    key={tab}
                    type="button"
                    className={tab === activeTab ? styles.tabActive : styles.tab}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </Button>
                ))}
              </div>
            ) : null}
          </main>
        </div>

        {showQuickAccess && quickIsRight ? (
          <div className={`${styles.quickSlot} ${styles.quickSlotRight} ${quickSlotAlignClass}`}>
            <aside className={styles.quickAccessRail}>
              <div className={styles.quickAccessLabel}>QUICK ACCESS</div>
              {quickAccessGames.map((g) => (
                <Button key={g.id} type="button" variant="ghost" className={styles.quickAccessItem} aria-label={g.name}>
                  <GameArtwork game={g} iconSize="small" tagsPosition={tagsPosition} showTags={showTags} />
                </Button>
              ))}
            </aside>
          </div>
        ) : null}

        {showQuickAccess && quickIsStackedBottom ? (
          <div className={`${styles.quickSlot} ${styles.quickSlotStack} ${styles.quickCenter}`}>
            <aside className={`${styles.quickAccessRail} ${styles.quickAccessRailRow}`}>
              <div className={styles.quickAccessLabel}>QUICK ACCESS</div>
              {quickAccessGames.map((g) => (
                <Button key={g.id} type="button" variant="ghost" className={styles.quickAccessItem} aria-label={g.name}>
                  <GameArtwork game={g} iconSize="small" tagsPosition={tagsPosition} showTags={showTags} />
                </Button>
              ))}
            </aside>
          </div>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerItem}>{computerName}</span>
        <span className={styles.footerItem}>{settings.runningText?.trim() || 'Powered by EZJR'}</span>
        <span className={styles.footerTime}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </footer>
    </div>
  )
}
