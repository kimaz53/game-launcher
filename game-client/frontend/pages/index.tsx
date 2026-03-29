import Head from 'next/head'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Gamepad2,
  LayoutGrid,
  Minus,
  ArrowRight,
  Search,
  X,
} from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Input } from '../components/ui/input'
import {
  GetClientIdentityJSON,
  GetComputerName,
  GetWindowsStartupStatus,
  LaunchGame,
  LoadManagerCategoriesJSON,
  LoadManagerClientsJSON,
  LoadManagerGamesJSON,
  LoadManagerLinksJSON,
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
  /** Lowercased IPs; empty = visible to all clients */
  allowedClientIps?: string[]
}

type ManagerClient = { name: string; ip: string }

type ManagerCategory = { name: string; iconRelPath?: string }

type CategoryTabItem = { key: string; label: string; iconRelPath?: string }
type IconSize = 'small' | 'medium' | 'large'

type ManagerLink = {
  id: number
  label: string
  url: string
  /** Relative image path under shared data (optional). */
  icon?: string
}

type ManagerSettings = {
  shopName?: string
  gameOrder?: 'A-Z' | 'Z-A'
  whenLaunchingGame?: 'minimized' | 'normal' | 'exit'
  gameIconSize?: IconSize
  categoryPosition?: string
  /** Default true when unset */
  showCategoryIcons?: boolean
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

function normalizeIp(s: string): string {
  return s.trim().toLowerCase()
}

function normalizeHostLabel(s: string): string {
  return s.trim().toLowerCase()
}

function dedupeLowerStrings(values: string[]): string[] {
  const seen: Record<string, true> = {}
  const out: string[] = []
  for (const v of values) {
    const k = normalizeIp(v)
    if (!k || seen[k]) continue
    seen[k] = true
    out.push(k)
  }
  return out
}

function parseAllowedClientIps(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return dedupeLowerStrings(raw.map((x) => String(x)))
  }
  if (typeof raw === 'string') {
    return dedupeLowerStrings(raw.split(','))
  }
  return []
}

function parseManagerLinksJson(json: string): ManagerLink[] {
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    const seen = new Set<number>()
    const out: ManagerLink[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const id = Number(o.id)
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      const url = typeof o.url === 'string' ? o.url.trim() : ''
      const iconRaw = typeof o.icon === 'string' ? o.icon.trim() : ''
      if (!Number.isFinite(id) || id <= 0 || seen.has(id) || !label || !url) continue
      seen.add(id)
      const row: ManagerLink = { id, label, url }
      if (iconRaw) row.icon = iconRaw
      out.push(row)
    }
    return out.sort((a, b) => a.id - b.id)
  } catch {
    return []
  }
}

function HeaderLinkButton({ link }: { link: ManagerLink }) {
  const [iconSrc, setIconSrc] = useState('')

  useEffect(() => {
    const p = link.icon?.trim()
    if (!p) {
      setIconSrc('')
      return
    }
    let cancelled = false
    void ReadManagerImageDataURL(p).then((d) => {
      if (!cancelled) setIconSrc(d || '')
    })
    return () => {
      cancelled = true
    }
  }, [link.icon])

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="flex h-8 max-w-[min(12rem,40vw)] shrink-0 flex-row items-center gap-1.5 px-2.5 text-xs font-medium text-theme-text hover:bg-theme-card/80"
      title={`${link.label} — ${link.url}`}
      onClick={() => BrowserOpenURL(link.url)}
    >
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className="h-4 w-4 shrink-0 object-contain" aria-hidden />
      ) : null}
      <span className="min-w-0 truncate">{link.label}</span>
    </Button>
  )
}

function parseManagerGame(raw: unknown): ManagerGame {
  if (!raw || typeof raw !== 'object') {
    return { id: 0, name: '', category: '', tags: [] }
  }
  const r = raw as Record<string, unknown>
  const tagsRaw = r.tags
  let tags: string[] = []
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.map(String)
  } else if (typeof tagsRaw === 'string') {
    tags = tagsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return {
    id: Number(r.id) || 0,
    name: String(r.name ?? ''),
    exePath: r.exePath != null ? String(r.exePath) : undefined,
    args: r.args != null ? String(r.args) : undefined,
    category: String(r.category ?? ''),
    tags,
    coverRelPath: r.coverRelPath != null ? String(r.coverRelPath) : undefined,
    exeIconRelPath: r.exeIconRelPath != null ? String(r.exeIconRelPath) : undefined,
    allowedClientIps: parseAllowedClientIps(r.allowedClientIps),
  }
}

function parseManagerClients(json: string): ManagerClient[] {
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    const out: ManagerClient[] = []
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      const ip = typeof o.ip === 'string' ? o.ip.trim() : ''
      if (!name || !ip) continue
      out.push({ name, ip })
    }
    return out
  } catch {
    return []
  }
}

function isRegisteredClient(
  identity: { hostname: string; ipv4: string[] } | null,
  clients: ManagerClient[],
): boolean {
  if (!identity || !identity.hostname.trim()) return false
  const host = normalizeHostLabel(identity.hostname)
  const localIPs = new Set(identity.ipv4.map(normalizeIp))
  for (const c of clients) {
    const ip = normalizeIp(c.ip)
    if (!ip || !localIPs.has(ip)) continue
    if (normalizeHostLabel(c.name) === host) return true
  }
  return false
}

/** Games are hidden unless this PC (IP + hostname) exists in `clients.json`. */
function isGameVisibleToClient(
  game: ManagerGame,
  identity: { hostname: string; ipv4: string[] } | null,
  clients: ManagerClient[],
): boolean {
  const allowed = game.allowedClientIps
  // Even "all clients" games require the current machine to be registered.
  if (!allowed || allowed.length === 0) return isRegisteredClient(identity, clients)
  if (!isRegisteredClient(identity, clients)) return false
  if (!identity) return false

  const host = normalizeHostLabel(identity.hostname)
  const localIPs = new Set(identity.ipv4.map(normalizeIp))

  const clientByIP = new Map<string, ManagerClient>()
  for (const c of clients) {
    const k = normalizeIp(c.ip)
    if (k) clientByIP.set(k, c)
  }

  for (const allowedIP of allowed) {
    const ip = normalizeIp(allowedIP)
    if (!ip || !localIPs.has(ip)) continue
    const client = clientByIP.get(ip)
    if (!client) continue
    if (normalizeHostLabel(client.name) === host) return true
  }
  return false
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
  accent: string
}

const palettes: Record<string, { dark: ThemePalette; light: ThemePalette }> = {
  'vs-blue': {
    dark: {
      appBackground: '#0D1117',
      panel: '#161B22',
      panelAlt: '#1F2937',
      border: '#30363D',
      text: '#F0F6FC',
      muted: '#9BA7B4',
      primary: '#3B82F6',
      primaryHover: '#2563EB',
      accent: '#0EA5E9',
    },
    light: {
      appBackground: '#F0F2F5',
      panel: '#FAFBFC',
      panelAlt: '#FFFFFF',
      border: '#C4CDD6',
      text: '#0D1117',
      muted: '#4C5768',
      primary: '#0969DA',
      primaryHover: '#0550AE',
      accent: '#0550AE',
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
      accent: '#22D3EE',
    },
    light: {
      appBackground: '#EDF2F1',
      panel: '#F7FBFA',
      panelAlt: '#FFFFFF',
      border: '#A8BDB8',
      text: '#0D1B18',
      muted: '#3D524E',
      primary: '#0F766E',
      primaryHover: '#0D5C56',
      accent: '#0E7490',
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
      accent: '#A78BFA',
    },
    light: {
      appBackground: '#F2F0FA',
      panel: '#FBFAFF',
      panelAlt: '#FFFFFF',
      border: '#B8B3D0',
      text: '#14121F',
      muted: '#4A4558',
      primary: '#6D28D9',
      primaryHover: '#5B21B6',
      accent: '#5B21B6',
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
      accent: '#66D9EF',
    },
    light: {
      appBackground: '#EDE8DE',
      panel: '#F5F0E6',
      panelAlt: '#FFFDF8',
      border: '#B0A896',
      text: '#252820',
      muted: '#4F4A3F',
      primary: '#C4154B',
      primaryHover: '#A91242',
      accent: '#0B7285',
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
      accent: '#78DCE8',
    },
    light: {
      appBackground: '#EEEBE6',
      panel: '#F6F3EE',
      panelAlt: '#FFFCF9',
      border: '#B5AFA7',
      text: '#1F1C19',
      muted: '#4F4A45',
      primary: '#6B5BC9',
      primaryHover: '#5849B0',
      accent: '#1E8A99',
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
      accent: '#8BE9FD',
    },
    light: {
      appBackground: '#E8EAEF',
      panel: '#F2F4F8',
      panelAlt: '#FFFFFF',
      border: '#A8AFBC',
      text: '#161820',
      muted: '#454A54',
      primary: '#D97706',
      primaryHover: '#B45309',
      accent: '#0284C7',
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
      accent: '#83A598',
    },
    light: {
      appBackground: '#F2E6C3',
      panel: '#FAF0D2',
      panelAlt: '#FFF9E6',
      border: '#C4B28C',
      text: '#282421',
      muted: '#504945',
      primary: '#B57614',
      primaryHover: '#9D6308',
      accent: '#427B58',
    },
  },
  dracula: {
    dark: {
      appBackground: '#282A36',
      panel: '#21222C',
      panelAlt: '#303447',
      border: '#44475A',
      text: '#F8F8F2',
      muted: '#B6B9C8',
      primary: '#BD93F9',
      primaryHover: '#A67DE8',
      accent: '#8BE9FD',
    },
    light: {
      appBackground: '#EEEEF5',
      panel: '#F6F6FC',
      panelAlt: '#FFFFFF',
      border: '#B4B4CC',
      text: '#1E2130',
      muted: '#4A4F63',
      primary: '#7C5ECF',
      primaryHover: '#6B4BC4',
      accent: '#0891B2',
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
      accent: '#88C0D0',
    },
    light: {
      appBackground: '#E2E6ED',
      panel: '#EEF1F6',
      panelAlt: '#FFFFFF',
      border: '#B8C0D0',
      text: '#1C2430',
      muted: '#3D4759',
      primary: '#5E81AC',
      primaryHover: '#4C6F99',
      accent: '#8FBCBB',
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
  root.setProperty('--color-secondary-accent', hexToRgbChannels(palette.accent))
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

/**
 * TOP/BOTTOM use `left|center|right`; LEFT/RIGHT use `upper|center|lower`.
 * Migrates legacy corner keys and old `top-upper`-style values.
 */
const LEGACY_CORNER_TO_UNIFIED: Record<string, string> = {
  'top-left': 'top-upper',
  'top-center': 'top-center',
  'top-right': 'top-lower',
  'bottom-left': 'bottom-upper',
  'bottom-center': 'bottom-center',
  'bottom-right': 'bottom-lower',
  'center-left': 'left-center',
  'center-right': 'right-center',
}

const OLD_HORIZONTAL_AXIS: Record<string, string> = {
  'top-upper': 'top-left',
  'top-lower': 'top-right',
  'bottom-upper': 'bottom-left',
  'bottom-lower': 'bottom-right',
}

type LayoutEdge = 'top' | 'bottom' | 'left' | 'right'

function tryCanonicalLayoutPosition(raw: string | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  let v = String(raw).trim().toLowerCase()
  if (LEGACY_CORNER_TO_UNIFIED[v]) v = LEGACY_CORNER_TO_UNIFIED[v]
  if (OLD_HORIZONTAL_AXIS[v]) v = OLD_HORIZONTAL_AXIS[v]
  if (/^(top|bottom)-(left|center|right)$/.test(v)) return v
  if (/^(left|right)-(upper|center|lower)$/.test(v)) return v
  return null
}

function normalizeLayoutPosition(value: string | undefined, fallback: string): string {
  return tryCanonicalLayoutPosition(value) ?? tryCanonicalLayoutPosition(fallback) ?? 'top-left'
}

function parseLayoutPosition(value: string | undefined, fallback: string): { edge: LayoutEdge; sub: string } {
  const normalized = normalizeLayoutPosition(value, fallback)
  const [e, s] = normalized.split('-')
  const edge = (['top', 'bottom', 'left', 'right'].includes(e) ? e : 'top') as LayoutEdge
  if (edge === 'top' || edge === 'bottom') {
    const sub = ['left', 'center', 'right'].includes(s) ? s : 'left'
    return { edge, sub }
  }
  const sub = ['upper', 'center', 'lower'].includes(s) ? s : 'center'
  return { edge, sub }
}

function categoryRailMainAlignClass(sub: string): string {
  switch (sub) {
    case 'center':
      return 'justify-center'
    case 'lower':
      return 'justify-end'
    default:
      return 'justify-start'
  }
}

/** Outer flex alignment for top/bottom strips (e.g. quick access row), not category tab pills. */
function horizontalStripJustifyClass(sub: string): string {
  switch (sub) {
    case 'center':
      return 'justify-center'
    case 'right':
      return 'justify-end'
    default:
      return 'justify-start'
  }
}

function verticalSlotSelfAlignClass(sub: string): string {
  switch (sub) {
    case 'center':
      return 'self-center'
    case 'lower':
      return 'self-end'
    default:
      return 'self-start'
  }
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

function CategoryTabLabel({
  tab,
  tabAlign,
  showIcons,
}: {
  tab: CategoryTabItem
  tabAlign: 'bar' | 'left' | 'right'
  showIcons: boolean
}) {
  return (
    <span className={categoryTabRowClass(tabAlign)}>
      {showIcons ? (
        tab.key === 'ALL' ? (
          <LayoutGrid className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        ) : (
          <CategoryTabIcon relPath={tab.iconRelPath} />
        )
      ) : null}
      <span className="truncate">{tab.label}</span>
    </span>
  )
}

function tabKeyAttr(key: string): string {
  return encodeURIComponent(key).replace(/%/g, '_')
}

/** Category rail: stable box model, launcher-style glass + pills; horizontal bar scrolls + "More" when crowded. */
function LauncherCategoryTabs({
  tabItems,
  activeTab,
  onSelect,
  direction,
  tabAlign,
  showIcons,
  justifyClass,
  barAlign = 'left',
  columnMaxHeightPx,
}: {
  tabItems: CategoryTabItem[]
  activeTab: string
  onSelect: (key: string) => void
  direction: 'row' | 'column'
  tabAlign: 'bar' | 'left' | 'right'
  showIcons: boolean
  /** Legacy: column rail outer flex alignment (optional). */
  justifyClass?: string
  /** Horizontal bar only: tab strip alignment; `right` uses right-to-left order. */
  barAlign?: 'left' | 'center' | 'right'
  /** Column rail only: max height for scrollable panel (px). */
  columnMaxHeightPx?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [tabsOverflow, setTabsOverflow] = useState(false)

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    const overflow = maxScroll > 2
    setTabsOverflow(overflow)
    if (!overflow) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < maxScroll - 4)
  }, [])

  useLayoutEffect(() => {
    updateScrollHints()
    const t = window.setTimeout(() => updateScrollHints(), 0)
    return () => window.clearTimeout(t)
  }, [tabItems, barAlign, updateScrollHints])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => updateScrollHints())
    ro.observe(el)
    for (const child of Array.from(el.children)) {
      ro.observe(child as Element)
    }
    el.addEventListener('scroll', updateScrollHints, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateScrollHints)
    }
  }, [tabItems, barAlign, updateScrollHints])

  useEffect(() => {
    if (direction !== 'row') return
    const el = scrollRef.current
    if (!el) return
    const attr = tabKeyAttr(activeTab)
    const node = el.querySelector(`[data-cat-tab="${attr}"]`) as HTMLElement | null
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [activeTab, direction, tabItems])

  const scrollByDir = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  const panel = cn(
    'rounded-xl border border-white/10 bg-theme-sidebar/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl',
    'p-1',
    direction === 'column' && 'min-w-[10.5rem] max-w-[16rem]',
  )

  const columnListClass = 'flex w-full flex-col gap-1'

  const tabPills = tabItems.map((tab) => {
    const active = activeTab === tab.key
    return (
      <button
        key={tab.key}
        type="button"
        role="tab"
        data-cat-tab={tabKeyAttr(tab.key)}
        aria-selected={active}
        onClick={() => onSelect(tab.key)}
        className={cn(
          'inline-flex min-h-8 shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200',
          'border border-transparent',
          direction === 'column' && 'w-full',
          tabAlign === 'right' && direction === 'column' && 'justify-end text-right',
          tabAlign === 'left' && direction === 'column' && 'justify-start text-left',
          active
            ? 'bg-theme-primary text-theme-text shadow-[0_0_0_1px_rgba(255,255,255,0.12)] ring-2 ring-theme-primary/35'
            : 'text-theme-muted hover:bg-theme-card/60 hover:text-theme-text',
        )}
      >
        <CategoryTabLabel tab={tab} tabAlign={tabAlign} showIcons={showIcons} />
      </button>
    )
  })

  if (direction === 'column') {
    return (
      <div className={cn('mb-3 flex gap-2', justifyClass)}>
        <div
          className={cn(
            panel,
            columnListClass,
            'max-h-[min(52vh,28rem)] overflow-y-auto overflow-x-hidden [scrollbar-width:thin]',
          )}
          style={columnMaxHeightPx ? { maxHeight: `${columnMaxHeightPx}px` } : undefined}
          role="tablist"
          aria-label="Game categories"
        >
          {tabPills}
        </div>
      </div>
    )
  }

  const showArrows = canScrollLeft || canScrollRight
  const align = barAlign

  return (
    <div className="flex min-w-0 flex-nowrap items-center justify-start gap-1">
      {showArrows ? (
        <button
          type="button"
          aria-label="Scroll categories left"
          disabled={!canScrollLeft}
          onClick={() => scrollByDir(-200)}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-theme-text shadow-sm backdrop-blur-md transition-opacity',
            !canScrollLeft && 'pointer-events-none opacity-30',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          panel,
          'min-w-0 flex-1 overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        )}
        role="tablist"
        aria-label="Game categories"
      >
        {align === 'left' ? (
          <div className="inline-flex min-w-0 flex-nowrap items-stretch gap-1">{tabPills}</div>
        ) : (
          <div
            className={cn(
              'flex min-w-full flex-nowrap items-stretch',
              align === 'center' && 'justify-center',
              align === 'right' && 'justify-end',
            )}
          >
            <div
              className={cn(
                'inline-flex min-w-0 flex-nowrap items-stretch gap-1',
                align === 'right' && 'flex-row-reverse',
              )}
            >
              {tabPills}
            </div>
          </div>
        )}
      </div>

      {showArrows ? (
        <button
          type="button"
          aria-label="Scroll categories right"
          disabled={!canScrollRight}
          onClick={() => scrollByDir(200)}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-theme-card/50 text-theme-text shadow-sm backdrop-blur-md transition-opacity',
            !canScrollRight && 'pointer-events-none opacity-30',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      {tabsOverflow && tabItems.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-theme-card/55 px-2 text-xs text-theme-muted shadow-sm backdrop-blur-md outline-none hover:bg-theme-card/80 hover:text-theme-text focus-visible:ring-2 focus-visible:ring-theme-primary/40"
              title="All categories"
              aria-label="More categories"
            >
              <span className="hidden sm:inline">More</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            <DropdownMenuRadioGroup value={activeTab} onValueChange={onSelect}>
              {tabItems.map((tab) => (
                <DropdownMenuRadioItem key={tab.key} value={tab.key}>
                  <CategoryTabLabel tab={tab} tabAlign="left" showIcons={showIcons} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function tagPosClass(pos: string): string {
  const { edge, sub } = parseLayoutPosition(pos, 'top-left')
  if (edge === 'top') {
    if (sub === 'center') return 'top-2 left-1/2 -translate-x-1/2 justify-center'
    if (sub === 'right') return 'top-2 right-2 justify-end'
    return 'top-2 left-2 justify-start'
  }
  if (edge === 'bottom') {
    if (sub === 'center') return 'bottom-2 left-1/2 -translate-x-1/2 justify-center'
    if (sub === 'right') return 'bottom-2 right-2 justify-end'
    return 'bottom-2 left-2 justify-start'
  }
  if (edge === 'left') {
    if (sub === 'center') return 'left-2 top-1/2 -translate-y-1/2 justify-start'
    if (sub === 'lower') return 'left-2 bottom-2 justify-start'
    return 'left-2 top-2 justify-start'
  }
  if (sub === 'center') return 'right-2 top-1/2 -translate-y-1/2 justify-end'
  if (sub === 'lower') return 'right-2 bottom-2 justify-end'
  return 'right-2 top-2 justify-end'
}

function iconOnlyImageClass(iconSize: IconSize): string {
  switch (iconSize) {
    case 'small':
      return 'h-full w-full object-contain object-center'
    case 'large':
      return 'object-contain'
    default:
      return 'object-contain'
  }
}

function GameArtwork({
  game,
  iconSize,
  tagsPosition,
  showTags,
  className,
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
      ? 'aspect-square size-10 shrink-0 !bg-transparent !border-none'
      : iconSize === 'large'
        ? 'h-[220px] w-[160px]'
        : 'h-[180px] w-[132px]'

  const containerClass = cn(
    'rounded-xl border border-white/10 bg-theme-sidebar/90 shadow-inner flex items-center justify-center overflow-hidden ring-1 ring-black/20',
    cls,
    className,
  )

  const coverImgClass = 'h-full w-full object-cover'
  const iconImgClass = cn('shrink-0', iconOnlyImageClass(iconSize))

  const rootWrap = cn('relative', iconSize === 'small' && 'shrink-0')

  if (src) {
    return (
      <div className={rootWrap}>
        <div className={containerClass}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={game.name}
            className={usesCoverArt ? coverImgClass : iconImgClass}
            draggable={false}
          />
        </div>
        {showTags && game.tags?.length ? (
          <div className={`absolute z-10 flex max-w-[90%] flex-wrap gap-1 ${tagPosClass(tagsPosition)}`}>
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
    <div className={rootWrap}>
      <div className={containerClass}>
        <div className="text-2xl font-bold text-theme-muted">{game.name.slice(0, 1).toUpperCase()}</div>
      </div>
      {showTags && iconSize !== 'small' && game.tags?.length ? (
        <div className={`absolute z-10 flex max-w-[90%] flex-wrap gap-1 ${tagPosClass(tagsPosition)}`}>
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
  const [managerClients, setManagerClients] = useState<ManagerClient[]>([])
  const [clientIdentity, setClientIdentity] = useState<{ hostname: string; ipv4: string[] } | null>(null)
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
  const [headerLinks, setHeaderLinks] = useState<ManagerLink[]>([])
  const libraryGridRef = useRef<HTMLDivElement | null>(null)
  const [libraryGridHeightPx, setLibraryGridHeightPx] = useState<number | null>(null)
  const [libraryGridWidthPx, setLibraryGridWidthPx] = useState<number | null>(null)
  const [libraryGridScrollTop, setLibraryGridScrollTop] = useState(0)

  useEffect(() => {
    void GetWindowsStartupStatus()
      .then((s) => {
        if (s === 'on' || s === 'off') setWindowsStartupStatus(s)
      })
      .catch(() => { })
  }, [])

  useLayoutEffect(() => {
    const el = libraryGridRef.current
    if (!el) return
    const apply = () => {
      const r = el.getBoundingClientRect()
      setLibraryGridHeightPx(Math.max(0, Math.round(r.height)))
      setLibraryGridWidthPx(Math.max(0, Math.round(r.width)))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Clear selection on click outside tiles (`click` avoids scrollbar pointerdown quirks). */
  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('[data-game-tile]')) return
      setSelectedGameId(null)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const [gamesJson, categoriesJson, quickJson, settingsJson, clientsJson, identityJson, linksJson] = await Promise.all([
        LoadManagerGamesJSON(),
        LoadManagerCategoriesJSON(),
        LoadManagerQuickAccessJSON(),
        LoadManagerSettingsJSON(),
        LoadManagerClientsJSON(),
        GetClientIdentityJSON(),
        LoadManagerLinksJSON(),
      ])
      void GetComputerName().then((n) => {
        if (!cancelled && n?.trim()) setComputerName(n.trim())
      })

      if (cancelled) return

      setManagerClients(parseManagerClients(clientsJson))
      try {
        const idParsed = JSON.parse(identityJson) as { hostname?: string; ipv4?: unknown }
        const hostname = typeof idParsed.hostname === 'string' ? idParsed.hostname : ''
        const ipv4 = Array.isArray(idParsed.ipv4)
          ? idParsed.ipv4.map((x) => String(x).trim()).filter(Boolean)
          : []
        setClientIdentity({ hostname, ipv4 })
      } catch {
        setClientIdentity(null)
      }

      try {
        const parsedGames = JSON.parse(gamesJson) as unknown[]
        setGames(Array.isArray(parsedGames) ? parsedGames.map(parseManagerGame) : [])
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

      setHeaderLinks(parseManagerLinksJson(linksJson))

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
  const categoryLayout = parseLayoutPosition(settings.categoryPosition, 'top-left')
  const quickLayout = parseLayoutPosition(settings.quickAccessPosition, 'right-center')
  const tagsPosition = normalizeLayoutPosition(settings.tagsPosition, 'top-left')
  const showTags = settings.showTags !== false
  const showCategoryIcons = settings.showCategoryIcons !== false
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
  const quickIsLeft = quickLayout.edge === 'left'
  const quickIsRight = quickLayout.edge === 'right'
  const quickIsStackedTop = quickLayout.edge === 'top'
  const quickIsStackedBottom = quickLayout.edge === 'bottom'
  const quickIsStacked = quickIsStackedTop || quickIsStackedBottom

  const quickSlotAlignClass =
    quickIsStackedTop || quickIsStackedBottom
      ? horizontalStripJustifyClass(quickLayout.sub)
      : verticalSlotSelfAlignClass(quickLayout.sub)

  const visibleGames = useMemo(
    () => games.filter((g) => isGameVisibleToClient(g, clientIdentity, managerClients)),
    [games, clientIdentity, managerClients],
  )

  const tabItems = useMemo((): CategoryTabItem[] => {
    const items: CategoryTabItem[] = [{ key: 'ALL', label: 'ALL' }]
    const assignedNames = new Set<string>()
    for (const g of visibleGames) {
      for (const part of parseMulti(g.category)) {
        assignedNames.add(part)
      }
    }
    for (const c of categories) {
      const name = c.name.trim()
      if (!name || !assignedNames.has(name)) continue
      const icon = (c.iconRelPath ?? '').trim()
      items.push({
        key: name,
        label: name,
        iconRelPath: icon || undefined,
      })
    }
    return items
  }, [categories, visibleGames])

  useEffect(() => {
    if (activeTab === 'ALL') return
    const valid = new Set(tabItems.map((t) => t.key))
    if (!valid.has(activeTab)) setActiveTab('ALL')
  }, [activeTab, tabItems])

  const filteredGames = useMemo(() => {
    const query = committedSearch.trim().toLowerCase()
    const base = visibleGames.filter((g) => {
      if (activeTab !== 'ALL') {
        const cats = parseMulti(g.category)
        if (!cats.includes(activeTab)) return false
      }
      if (!query) return true
      return `${g.name} ${g.category} ${g.tags?.join(' ') ?? ''}`.toLowerCase().includes(query)
    })

    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return sortOrder === 'Z-A' ? sorted.reverse() : sorted
  }, [visibleGames, activeTab, committedSearch, sortOrder])

  const quickAccessGames = useMemo(() => {
    const map = new Map<number, ManagerGame>()
    visibleGames.forEach((g) => map.set(g.id, g))
    return quickAccessIds.map((id) => map.get(id)).filter(Boolean) as ManagerGame[]
  }, [visibleGames, quickAccessIds])

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
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const libraryShellClass =
    'rounded-2xl border border-white/10 bg-theme-sidebar/30 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl ring-1 ring-white/5'
  const quickDockClass =
    'rounded-2xl border border-white/10 bg-gradient-to-b from-theme-card/50 to-theme-sidebar/40 p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/5'

  return (
    <div
      className="relative isolate flex h-screen w-screen flex-col overflow-hidden bg-theme-app bg-cover bg-center bg-no-repeat font-[system-ui,'Segoe_UI',-apple-system,sans-serif] text-theme-text antialiased selection:bg-theme-primary/30"
      style={backgroundImageSrc ? { backgroundImage: `url("${backgroundImageSrc}")` } : undefined}
    >
      <Head>
        <title>Game Menu</title>
      </Head>

      {backgroundImageSrc ? (
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-theme-app/85 via-theme-app/70 to-theme-app/95 backdrop-blur-[2px]" />
      ) : (
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-theme-app via-theme-sidebar/20 to-theme-app" />
      )}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.35)_100%)]" />

      <header className="relative z-10 mx-3 mt-2 flex min-h-[3.25rem] shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-theme-sidebar/45 px-3 py-2 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)] backdrop-blur-xl md:mx-4 md:mt-3 md:min-h-[3.5rem] md:gap-4 md:px-4">
        <div className="flex min-w-0 flex-1 items-center justify-start md:flex-none">
          {logoImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img draggable={false} src={logoImageSrc} alt={shopName} className="max-h-14 w-auto max-w-[min(280px,40vw)] object-contain drop-shadow-md md:max-h-16" />
          ) : (
            <div className="truncate bg-gradient-to-r from-theme-text to-theme-muted bg-clip-text text-2xl font-bold tracking-[0.2em] text-transparent md:text-3xl">
              {shopName}
            </div>
          )}
        </div>
        <div className="relative flex min-w-0 max-w-md flex-1 items-center gap-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-theme-muted" aria-hidden />
          <Input
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-theme-card/80 pl-9 pr-3 text-sm shadow-inner transition-[box-shadow,background] placeholder:text-theme-muted focus-visible:border-theme-primary/40 focus-visible:ring-2 focus-visible:ring-theme-primary/25"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitSearch()
              }
            }}
            placeholder="Search your library…"
            aria-label="Search games"
          />
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl shadow-md transition-transform hover:scale-[1.03] active:scale-[0.98]"
            aria-label="Apply search"
            onClick={() => commitSearch()}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          {headerLinks.map((link) => (
            <HeaderLinkButton key={link.id} link={link} />
          ))}
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full text-theme-text hover:bg-theme-card/80"
              aria-label="Minimize"
              onClick={() => WindowMinimise()}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full text-theme-text hover:bg-theme-error/90 hover:text-theme-text"
              aria-label="Close"
              onClick={() => Quit()}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div
        className={cn(
          'relative z-10 mx-3 mb-2 mt-2 flex min-h-0 flex-1 md:mx-4 gap-2',
          quickIsStacked && 'flex-col',
        )}
      >
        {showQuickAccess && quickIsStackedTop && quickAccessGames.length > 0 ? (
          <div className={cn('flex w-full px-5', quickSlotAlignClass, quickDockClass)}>
            <aside className="flex items-center gap-2">
              {showQuickAccessTitle ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-theme-muted">Quick access</span>
              ) : null}
              <div className={cn('flex max-w-full overflow-x-auto items-center gap-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden')}>
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
          <div className={cn('order-[-1] flex min-h-0 self-stretch flex-col', quickSlotAlignClass, quickDockClass)}>
            <aside className="flex min-h-0 flex-1 flex-col items-center gap-2">
              {showQuickAccessTitle ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-theme-muted">Quick access</span>
              ) : null}
              <div
                className={cn('flex w-full min-h-0 flex-col overflow-y-auto items-center gap-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden')}
                style={
                  libraryGridHeightPx != null && libraryGridHeightPx > 0
                    ? { height: libraryGridHeightPx, maxHeight: libraryGridHeightPx }
                    : undefined
                }
              >
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

        <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto [scrollbar-width:thin]">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            {categoryLayout.edge === 'top' ? (
              <LauncherCategoryTabs
                tabItems={tabItems}
                activeTab={activeTab}
                onSelect={setActiveTab}
                direction="row"
                tabAlign="bar"
                showIcons={showCategoryIcons}
                barAlign={categoryLayout.sub as 'left' | 'center' | 'right'}
              />
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 gap-3">
              {categoryLayout.edge === 'left' ? (
                <div
                  className={cn(
                    'mb-0 flex min-h-0 min-w-0 flex-col flex-nowrap self-stretch',
                    categoryRailMainAlignClass(categoryLayout.sub),
                  )}
                >
                  <LauncherCategoryTabs
                    tabItems={tabItems}
                    activeTab={activeTab}
                    onSelect={setActiveTab}
                    direction="column"
                    tabAlign="left"
                    showIcons={showCategoryIcons}
                    columnMaxHeightPx={libraryGridHeightPx ?? undefined}
                  />
                </div>
              ) : null}

              <div
                ref={libraryGridRef}
                onScroll={(e) => setLibraryGridScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
                className={cn(
                  'relative min-h-0 min-w-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin] overscroll-contain',
                  libraryShellClass,
                )}
              >
                {(() => {
                  const w = libraryGridWidthPx ?? 0
                  const h = libraryGridHeightPx ?? 0
                  const gapPx = 12
                  const minTileWidthPx =
                    iconSize === 'small' ? 90 : iconSize === 'large' ? 149 : 130
                  const rowHeightPx =
                    iconSize === 'small' ? 95 : iconSize === 'large' ? 275 : 235

                  const usableWidth = Math.max(0, w - 32) // p-4 left+right
                  const cols = Math.max(1, Math.floor((usableWidth + gapPx) / (minTileWidthPx + gapPx)))
                  const tileWidth = Math.max(minTileWidthPx, Math.floor((usableWidth - gapPx * (cols - 1)) / cols))

                  const rowCount = Math.ceil(filteredGames.length / cols)
                  const totalHeight = rowCount * rowHeightPx

                  const overscanRows = 3
                  const startRow = Math.max(0, Math.floor(libraryGridScrollTop / rowHeightPx) - overscanRows)
                  const endRow = Math.min(
                    rowCount,
                    Math.ceil((libraryGridScrollTop + h) / rowHeightPx) + overscanRows,
                  )
                  const startIndex = startRow * cols
                  const endIndex = Math.min(filteredGames.length, endRow * cols)

                  return (
                    <div className="relative w-full" style={{ height: totalHeight }}>
                      {filteredGames.slice(startIndex, endIndex).map((game, i) => {
                        const idx = startIndex + i
                        const row = Math.floor(idx / cols)
                        const col = idx % cols
                        const selected = selectedGameId === game.id
                        return (
                          <div
                            key={game.id}
                            style={{
                              position: 'absolute',
                              top: row * rowHeightPx,
                              left: col * (tileWidth + gapPx),
                              width: tileWidth,
                              height: rowHeightPx,
                              paddingBottom: gapPx,
                            }}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              data-game-tile
                              className={cn(
                                'group relative flex h-auto w-full min-w-0 flex-col items-center gap-2 overflow-hidden border',
                                'border border-white/5 bg-theme-card/20 text-inherit shadow-sm ring-1 ring-black/20 transition-all duration-200',
                                'hover:-translate-y-0.5 hover:border-theme-primary/25 hover:bg-theme-card/45 hover:shadow-lg hover:shadow-black/30',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-theme-app',
                                selected &&
                                'border-theme-primary/40 bg-theme-primary/15 shadow-lg shadow-black/25 ring-2 ring-theme-primary/35',
                                '!rounded-xl px-0 !pb-2.5 !pt-0',
                                iconSize == 'small' && '!pt-2'
                              )}
                              onClick={() => setSelectedGameId(game.id)}
                              onDoubleClick={() => void handleLaunchGame(game)}
                            >
                              <GameArtwork
                                game={game}
                                iconSize={iconSize}
                                tagsPosition={tagsPosition}
                                showTags={showTags}
                              />
                              <span
                                className={cn(
                                  'line-clamp-2 w-full px-0.5 text-center text-xs font-normal leading-snug',
                                  selected ? 'text-theme-primary' : 'text-theme-text',
                                )}
                              >
                                {game.name}
                              </span>
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {categoryLayout.edge === 'right' ? (
                <div
                  className={cn(
                    'mb-0 flex min-h-0 min-w-0 flex-col flex-nowrap items-end self-stretch',
                    categoryRailMainAlignClass(categoryLayout.sub),
                  )}
                >
                  <LauncherCategoryTabs
                    tabItems={tabItems}
                    activeTab={activeTab}
                    onSelect={setActiveTab}
                    direction="column"
                    tabAlign="right"
                    showIcons={showCategoryIcons}
                    columnMaxHeightPx={libraryGridHeightPx ?? undefined}
                  />
                </div>
              ) : null}
            </div>

            {categoryLayout.edge === 'bottom' ? (
              <LauncherCategoryTabs
                tabItems={tabItems}
                activeTab={activeTab}
                onSelect={setActiveTab}
                direction="row"
                tabAlign="bar"
                showIcons={showCategoryIcons}
                barAlign={categoryLayout.sub as 'left' | 'center' | 'right'}
              />
            ) : null}
          </main>
        </div>

        {showQuickAccess && quickIsRight && quickAccessGames.length > 0 ? (
          <div className={cn('order-1 flex min-h-0 self-stretch flex-col', quickSlotAlignClass, quickDockClass)}>
            <aside className="flex min-h-0 flex-1 flex-col items-center gap-2">
              {showQuickAccessTitle ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-theme-muted">Quick access</span>
              ) : null}
              <div
                className={cn('flex w-full min-h-0 flex-col overflow-y-auto items-center gap-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden')}
                style={
                  libraryGridHeightPx != null && libraryGridHeightPx > 0
                    ? { height: libraryGridHeightPx, maxHeight: libraryGridHeightPx }
                    : undefined
                }
              >
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
          <div className={cn('flex w-full px-5', quickSlotAlignClass, quickDockClass)}>
            <aside className="flex items-center gap-2">
              {showQuickAccessTitle ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-theme-muted">Quick access</span>
              ) : null}
              <div className={cn('flex max-w-full overflow-x-auto items-center gap-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden')}>
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
        <footer className="relative z-10 mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-theme-sidebar/40 px-3 py-2.5 text-sm shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl md:mx-4">
          <span className="shrink-0 text-sm font-bold tracking-wide text-theme-primary">{computerName}</span>

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
            {`${date} ⋅ ${time}`}
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
