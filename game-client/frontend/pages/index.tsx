import Head from 'next/head'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Gamepad2,
  LayoutGrid,
  Library,
  PanelRight,
  Play,
  Search,
  ShoppingBag,
  Tags,
  Users,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../components/ui/hover-card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../components/ui/command'
import {
  GetClientIdentityJSON,
  GetComputerName,
  GetWindowsStartupStatus,
  LaunchGameBlocking,
  LaunchGameWithPID,
  LoadManagerCategoriesJSON,
  LoadManagerClientsJSON,
  LoadManagerGamesJSON,
  LoadManagerLinksJSON,
  LoadManagerQuickAccessJSON,
  LoadManagerLaunchStatsJSON,
  LoadManagerPopularJSON,
  LoadManagerSettingsJSON,
  LoadManagerTagsJSON,
  IsProcessRunning,
  RecordGameLaunch,
} from '../wailsjs/wailsjs/go/main/App'
import { BrowserOpenURL, Quit, WindowMinimise } from '../wailsjs/wailsjs/runtime/runtime'
import { cn } from '../lib/utils'
import clickSoundUrl from '../audio/click.wav'
import dingSoundUrl from '../audio/ding.wav'

type ManagerGame = {
  id: number
  name: string
  exePath?: string
  /** If set, controls which "launch path" field the client uses. */
  launchType?: 'exe' | 'script'
  /** Optional BAT/CMD/PowerShell script used when `launchType === 'script'`. */
  scriptPath?: string
  /** Optional BAT/CMD script to run before the main game launcher. */
  preLaunchScriptPath?: string
  args?: string
  category: string
  tags: string[]
  coverRelPath?: string
  /** IGDB screenshot_big for popular strip */
  popularImageRelPath?: string
  exeIconRelPath?: string
  /** Lowercased IPs; empty = visible to all clients */
  allowedClientIps?: string[]
  igdbGameId?: number
  igdbSummary?: string
  igdbStoryline?: string
  igdbReleaseSec?: number
  igdbGenres?: string[]
  igdbTrailerYouTubeId?: string
  igdbScreenshotUrls?: string[]
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
  /** Default true when unset */
  showCategoryIcons?: boolean
  showTags?: boolean
  showQuickAccess?: boolean
  showQuickAccessTitle?: boolean
  /** Popular strip under header row in main column */
  showPopularStrip?: boolean
  /** Absolute path to popular.json or folder containing it (diskless / network) */
  popularDataPath?: string
  /** Right panel: IGDB / simple game details (default on) */
  showGameDetailsSidebar?: boolean
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

/** HTTP URL served by game-client's Wails asset handler from the manager data dir (avoids base64 in JS). */
function managerImageAssetUrl(relPath: string): string {
  const p = relPath.trim().replace(/\\/g, '/')
  if (!p) return ''
  return `/manager-img?p=${encodeURIComponent(p)}`
}

function HeaderLinkButton({ link }: { link: ManagerLink }) {
  const p = link.icon?.trim()
  const iconSrc = p ? managerImageAssetUrl(p) : ''

  return (
    <button
      type="button"
      className="wails-no-drag flex max-w-[min(7.5rem,26vw)] shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-transparent px-2.5 py-1 text-[11px] font-medium text-theme-muted transition-colors hover:border-white/[0.13] hover:bg-white/[0.04] hover:text-theme-text focus-visible:outline focus-visible:ring-2 focus-visible:ring-theme-primary/35"
      title={`${link.label} — ${link.url}`}
      onClick={() => BrowserOpenURL(link.url)}
    >
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className="h-3 w-3 shrink-0 rounded-sm object-contain" aria-hidden />
      ) : (
        // <span className="h-3 w-3 shrink-0 rounded-sm bg-theme-muted/80" aria-hidden />
        null
      )}
      <span className="min-w-0 truncate">{link.label}</span>
    </button>
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
    scriptPath: r.scriptPath != null ? String(r.scriptPath) : undefined,
    preLaunchScriptPath:
      r.preLaunchScriptPath != null ? String(r.preLaunchScriptPath) : undefined,
    launchType: (() => {
      const raw = r.launchType != null ? String(r.launchType) : ''
      if (raw === 'script') return 'script'
      if (raw === 'exe') return 'exe'

      const scriptTrim = (r.scriptPath != null ? String(r.scriptPath) : '').trim()
      if (scriptTrim) return 'script'

      const exeTrim = (r.exePath != null ? String(r.exePath) : '').trim().toLowerCase()
      if (exeTrim.endsWith('.bat') || exeTrim.endsWith('.cmd') || exeTrim.endsWith('.ps1')) return 'script'

      return 'exe'
    })(),
    args: r.args != null ? String(r.args) : undefined,
    category: String(r.category ?? ''),
    tags,
    coverRelPath: r.coverRelPath != null ? String(r.coverRelPath) : undefined,
    popularImageRelPath:
      r.popularImageRelPath != null ? String(r.popularImageRelPath) : undefined,
    exeIconRelPath: r.exeIconRelPath != null ? String(r.exeIconRelPath) : undefined,
    allowedClientIps: parseAllowedClientIps(r.allowedClientIps),
    igdbGameId:
      r.igdbGameId != null && !Number.isNaN(Number(r.igdbGameId)) ? Number(r.igdbGameId) : undefined,
    igdbSummary: r.igdbSummary != null ? String(r.igdbSummary) : undefined,
    igdbStoryline: r.igdbStoryline != null ? String(r.igdbStoryline) : undefined,
    igdbReleaseSec:
      r.igdbReleaseSec != null && !Number.isNaN(Number(r.igdbReleaseSec))
        ? Number(r.igdbReleaseSec)
        : undefined,
    igdbGenres: Array.isArray(r.igdbGenres)
      ? r.igdbGenres.map(String).filter((s) => s.trim())
      : undefined,
    igdbTrailerYouTubeId:
      r.igdbTrailerYouTubeId != null ? String(r.igdbTrailerYouTubeId) : undefined,
    igdbScreenshotUrls: Array.isArray(r.igdbScreenshotUrls)
      ? r.igdbScreenshotUrls.map(String).filter((s) => s.trim())
      : undefined,
  }
}

function managerGameHasIgdbMeta(g: ManagerGame): boolean {
  return (
    (g.igdbGameId ?? 0) > 0 ||
    !!(g.igdbSummary?.trim() || g.igdbStoryline?.trim()) ||
    !!(g.igdbTrailerYouTubeId?.trim()) ||
    (g.igdbScreenshotUrls?.length ?? 0) > 0 ||
    (g.igdbGenres?.length ?? 0) > 0
  )
}

function formatIgdbReleaseSec(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  try {
    return new Date(sec * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function pathBasename(p: string): string {
  const t = p.trim().replace(/\\/g, '/')
  const i = t.lastIndexOf('/')
  return i >= 0 ? t.slice(i + 1) : t
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

type ThemeAppearance = 'dark' | 'light'

type WailsWindowChrome = {
  WindowSetLightTheme?: () => void
  WindowSetDarkTheme?: () => void
}

function syncWailsWindowChrome(appearance?: ThemeAppearance) {
  if (typeof window === 'undefined') return
  const rt = (window as unknown as { runtime?: WailsWindowChrome }).runtime
  const mode: ThemeAppearance = appearance === 'light' ? 'light' : 'dark'
  if (mode === 'light') rt?.WindowSetLightTheme?.()
  else rt?.WindowSetDarkTheme?.()
}

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

function CategoryTabIcon({ relPath }: { relPath?: string }) {
  const p = relPath?.trim()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [p])

  if (!p || failed) {
    return <FolderOpen className="h-4 w-4 shrink-0 text-theme-muted" aria-hidden />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={managerImageAssetUrl(p)}
      alt=""
      className="h-4 w-4 shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function playUiSound(audio: HTMLAudioElement | null) {
  if (!audio) return
  audio.currentTime = 0
  void audio.play().catch(() => { })
}

const UI_SOUND_CLICK_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'label',
].join(', ')

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
  quickAccess,
  /** When true (library grid), width follows the tile column instead of fixed poster sizes. */
  fillTile,
}: {
  game: ManagerGame
  iconSize: IconSize
  tagsPosition: string
  showTags: boolean
  className?: string
  quickAccess?: boolean
  fillTile?: boolean
}) {
  const coverTrim = game.coverRelPath?.trim()
  const exeTrim = game.exeIconRelPath?.trim()
  const relPath =
    iconSize === 'small' ? exeTrim : coverTrim || exeTrim || ''
  const src = relPath ? managerImageAssetUrl(relPath) : ''
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [src])

  const usesCoverArt =
    iconSize !== 'small' && !!coverTrim

  const cls =
    iconSize === 'small'
      ? 'aspect-square size-10 shrink-0 !bg-transparent !border-none'
      : iconSize === 'large'
        ? fillTile
          ? 'h-[150px] w-full max-w-full min-w-0'
          : 'h-[220px] w-[160px]'
        : fillTile
          ? 'h-[130px] w-full max-w-full min-w-0'
          : 'h-[180px] w-[132px]'

  const containerClass = cn(
    'flex items-center justify-center overflow-hidden',
    iconSize === 'small' ? 'rounded-xl' : fillTile ? '' : '',
    cls,
    className,
  )

  const coverImgClass = cn('h-full w-full object-cover', iconSize !== 'small' && 'brightness-[0.97] contrast-[1.02]')
  const iconFillsTile = !!fillTile && iconSize !== 'small'
  const iconImgClass = iconFillsTile
    ? 'h-full w-full object-contain object-center'
    : cn('shrink-0', iconOnlyImageClass(iconSize))

  const rootWrap = cn(
    'relative',
    iconSize === 'small' && 'shrink-0',
    fillTile && iconSize !== 'small' && 'w-full min-w-0 max-w-full',
  )

  if (src && !imgFailed) {
    return (
      <div className={rootWrap}>
        <div className={cn(containerClass, quickAccess && '!ring-0 shadow-none border-none outline-none')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={game.name}
            className={usesCoverArt ? coverImgClass : iconImgClass}
            draggable={false}
            onError={() => setImgFailed(true)}
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

function GameTileTitle({ name, selected }: { name: string; selected: boolean }) {
  return (
    <div className="flex h-[34px] w-full min-w-0 items-center justify-center">
      <span
        className={cn(
          'line-clamp-2 w-full min-w-0 max-w-full whitespace-normal break-words px-1 text-center font-display text-[11px] font-semibold leading-snug tracking-wide',
          selected ? 'text-theme-primary' : 'text-theme-text',
        )}
        title={name}
      >
        {name}
      </span>
    </div>
  )
}

function NavRow({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[10px] border px-3.5 py-2 text-left text-xs font-medium transition-colors',
        active
          ? 'border-theme-primary/18 bg-theme-primary/12 text-theme-primary'
          : 'border-transparent text-theme-muted',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={cn('h-[15px] w-[15px] shrink-0', active ? 'opacity-100' : 'opacity-70')} aria-hidden />
      {label}
    </div>
  )
}

function parsePopularGameIds(json: string): number[] {
  try {
    const o = JSON.parse(json) as { gameIds?: unknown; ids?: unknown }
    const arr = o.gameIds ?? o.ids
    if (!Array.isArray(arr)) return []
    return arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
  } catch {
    return []
  }
}

/** launch-stats.json: { "opens": { "12": 47 } } — launch counts per game id (this PC / shared folder). */
function parseLaunchOpens(json: string): Map<number, number> {
  const m = new Map<number, number>()
  try {
    const o = JSON.parse(json) as { opens?: Record<string, unknown> }
    if (!o.opens || typeof o.opens !== 'object') return m
    for (const [k, v] of Object.entries(o.opens)) {
      const id = Number(k)
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(id) && id > 0 && Number.isFinite(n) && n >= 0) m.set(id, Math.floor(n))
    }
  } catch {
    /* ignore */
  }
  return m
}

/** Popular strip art: IGDB `t_screenshot_big` only (`popularImageRelPath`), framed 16:9. */
function PopularPopArt({ game }: { game: ManagerGame }) {
  const relPath = (game.popularImageRelPath ?? '').trim()
  const src = relPath ? managerImageAssetUrl(relPath) : ''
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [src])

  const frameClass =
    'relative h-full w-full overflow-hidden rounded-t-[14px] bg-theme-card'

  if (src && !imgFailed) {
    return (
      <div className={frameClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        frameClass,
        'flex items-center justify-center font-display text-[clamp(1.25rem,4vw,1.65rem)] font-black text-theme-muted/35',
      )}
    >
      {game.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function TagHoverChip({ tag }: { tag: string }) {
  // Remove the isTruncated logic entirely — always show the hover

  const chipEl = (
    <span className="truncate max-w-[5.2rem] rounded px-1.5 py-0.5 text-[9px] text-theme-muted bg-white/[0.05]">
      {tag}
    </span>
  )

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{chipEl}</HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-fit max-w-[14rem] text-theme-text">
        {tag}
      </HoverCardContent>
    </HoverCard>
  )
}

function GameDetailsSidebar({
  game,
  isLightMode,
  onCollapse,
  onPlay,
}: {
  game: ManagerGame | null
  isLightMode: boolean
  onCollapse: () => void
  onPlay: (game: ManagerGame) => void
}) {
  const hasIgdb = game ? managerGameHasIgdbMeta(game) : false
  const coverRel = game
    ? ((game.coverRelPath ?? '').trim() || (game.exeIconRelPath ?? '').trim())
    : ''
  const coverSrc = coverRel ? managerImageAssetUrl(coverRel) : ''

  return (
    <aside
      data-details-panel
      className={cn(
        '[grid-area:detail] flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-white/[0.07]',
        isLightMode ? 'bg-theme-sidebar/95' : 'bg-theme-sidebar/90',
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-theme-muted/80">
          Details
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="wails-no-drag rounded-md p-1 text-theme-muted transition-colors hover:bg-white/[0.06] hover:text-theme-text disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!game}
            onClick={() => {
              if (!game) return
              onPlay(game)
            }}
            aria-label="Play selected game"
          >
            <Play className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="wails-no-drag rounded-md p-1 text-theme-muted transition-colors hover:bg-white/[0.06] hover:text-theme-text"
            onClick={onCollapse}
            aria-label="Hide details panel"
          >
            <ArrowRightFromLine className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]">
        {!game ? (
          <p className="text-xs leading-relaxed text-theme-muted">
            Select a game in the library to see trailer, description, and other metadata here.
          </p>
        ) : hasIgdb ? (
          <>
            <div>
              <h2 className="font-display text-sm font-bold leading-snug text-theme-text">{game.name}</h2>
              {(game.igdbGameId ?? 0) > 0 ? (
                <div className="mt-1 text-[10px] text-theme-muted">
                  IGDB · id {game.igdbGameId}
                  {formatIgdbReleaseSec(game.igdbReleaseSec) ? (
                    <span> · {formatIgdbReleaseSec(game.igdbReleaseSec)}</span>
                  ) : null}
                </div>
              ) : formatIgdbReleaseSec(game.igdbReleaseSec) ? (
                <div className="mt-1 text-[10px] text-theme-muted">
                  {formatIgdbReleaseSec(game.igdbReleaseSec)}
                </div>
              ) : null}
            </div>
            {game.igdbScreenshotUrls && game.igdbScreenshotUrls.length > 0 ? (
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
                  Screenshots
                </div>
                <div className="flex max-h-36 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {game.igdbScreenshotUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      draggable={false}
                      className="h-32 w-auto max-w-[min(100%,12rem)] shrink-0 rounded-lg border border-white/[0.08] object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {(game.igdbTrailerYouTubeId ?? '').trim() ? (
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
                  Trailer
                </div>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/[0.08] bg-black">
                  <iframe
                    title={`Trailer — ${game.name}`}
                    className="absolute inset-0 h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent((game.igdbTrailerYouTubeId ?? '').trim())}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : null}
            {game.igdbGenres && game.igdbGenres.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {game.igdbGenres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-theme-muted"
                  >
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
            {(game.igdbSummary ?? '').trim() ? (
              <p className="text-xs leading-relaxed text-theme-muted">{game.igdbSummary!.trim()}</p>
            ) : null}
            {(game.igdbStoryline ?? '').trim() &&
              (game.igdbStoryline ?? '').trim() !== (game.igdbSummary ?? '').trim() ? (
              <p className="text-xs leading-relaxed text-theme-muted/90">{game.igdbStoryline!.trim()}</p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex gap-3">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverSrc}
                  alt=""
                  draggable={false}
                  className="h-20 w-14 shrink-0 rounded-lg border border-white/[0.08] object-cover"
                />
              ) : (
                <div
                  className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-theme-card font-display text-lg font-bold text-theme-muted/40"
                  aria-hidden
                >
                  {game.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-sm font-bold leading-snug text-theme-text">{game.name}</h2>
                <p className="mt-1 text-[10px] text-theme-muted">Custom entry — no IGDB metadata stored.</p>
              </div>
            </div>
            {(game.category ?? '').trim() ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
                  Categories
                </div>
                <p className="text-xs text-theme-text/90">{game.category}</p>
              </div>
            ) : null}
            {game.tags && game.tags.length > 0 ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {game.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-theme-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
                Launch
              </div>
              <p className="break-all font-mono text-[11px] text-theme-muted">
                {game.launchType === 'script'
                  ? (game.scriptPath ?? '').trim() || '—'
                  : (game.exePath ?? '').trim() || '—'}
              </p>
              {(game.preLaunchScriptPath ?? '').trim() ? (
                <p className="mt-1 break-all font-mono text-[10px] text-theme-muted/80">
                  Pre-launch: {pathBasename(game.preLaunchScriptPath ?? '')}
                </p>
              ) : null}
              {(game.args ?? '').trim() ? (
                <p className="mt-1 text-[10px] text-theme-muted">
                  <span className="font-semibold text-theme-muted">Args:</span> {game.args}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

export default function Home() {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [games, setGames] = useState<ManagerGame[]>([])
  const [managerClients, setManagerClients] = useState<ManagerClient[]>([])
  const [clientIdentity, setClientIdentity] = useState<{ hostname: string; ipv4: string[] } | null>(null)
  const [categories, setCategories] = useState<ManagerCategory[]>([])
  const [quickAccessIds, setQuickAccessIds] = useState<number[]>([])
  const [settings, setSettings] = useState<ManagerSettings>({})
  const [activeTab, setActiveTab] = useState('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [computerName, setComputerName] = useState('COMPUTER')
  const [backgroundImageSrc, setBackgroundImageSrc] = useState('')
  const [logoImageSrc, setLogoImageSrc] = useState('')
  // Boot gating: keep the UI blocked until base JSON + (optional) background/logo images are ready.
  const [jsonLoaded, setJsonLoaded] = useState(false)
  const [bgImageLoaded, setBgImageLoaded] = useState(false)
  const [logoImageLoaded, setLogoImageLoaded] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(true)
  const [quickAccessSeeAllOpen, setQuickAccessSeeAllOpen] = useState(false)
  const quickAccessScrollRef = useRef<HTMLDivElement | null>(null)
  const [launchDialog, setLaunchDialog] = useState<{
    title: string
    message: string
    iconSrc?: string
    gameName?: string
  } | null>(null)
  const [alreadyRunningDialogGame, setAlreadyRunningDialogGame] = useState<ManagerGame | null>(null)
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const runningGamePidsRef = useRef<Map<number, number>>(new Map())
  const [windowsStartupStatus, setWindowsStartupStatus] = useState<'on' | 'off' | ''>('')
  const [headerLinks, setHeaderLinks] = useState<ManagerLink[]>([])
  const [popularRawJson, setPopularRawJson] = useState('{}')
  const [launchStatsJson, setLaunchStatsJson] = useState('{}')
  const libraryGridRef = useRef<HTMLDivElement | null>(null)
  const [libraryGridHeightPx, setLibraryGridHeightPx] = useState<number | null>(null)
  const [libraryGridWidthPx, setLibraryGridWidthPx] = useState<number | null>(null)
  const [libraryGridScrollTop, setLibraryGridScrollTop] = useState(0)

  const clickAudioRef = useRef<HTMLAudioElement | null>(null)
  const dingAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastDingGameIdRef = useRef<number | null>(null)

  useEffect(() => {
    const clickA = new Audio(clickSoundUrl)
    const dingA = new Audio(dingSoundUrl)
    clickA.preload = 'auto'
    dingA.preload = 'auto'
    clickAudioRef.current = clickA
    dingAudioRef.current = dingA
    return () => {
      clickAudioRef.current = null
      dingAudioRef.current = null
    }
  }, [])

  const saveRunningGamePids = useCallback(() => {
    try {
      const obj: Record<string, number> = {}
      runningGamePidsRef.current.forEach((pid, gameId) => {
        if (gameId > 0 && pid > 0) obj[String(gameId)] = pid
      })
      localStorage.setItem('ezjr.runningGamePids', JSON.stringify(obj))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      try {
        const raw = localStorage.getItem('ezjr.runningGamePids') || '{}'
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const entries = Object.entries(parsed)
          .map(([k, v]) => [Number(k), typeof v === 'number' ? v : Number(v)] as const)
          .filter(([gid, pid]) => Number.isFinite(gid) && gid > 0 && Number.isFinite(pid) && pid > 0)

        const next = new Map<number, number>()
        for (const [gid, pid] of entries) {
          // eslint-disable-next-line no-await-in-loop
          const running = await IsProcessRunning(pid)
          if (running) next.set(gid, pid)
        }
        if (!cancelled) {
          runningGamePidsRef.current = next
          saveRunningGamePids()
        }
      } catch {
        /* ignore */
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [saveRunningGamePids])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      const t = e.target
      if (!(t instanceof Element)) return
      if (!t.closest(UI_SOUND_CLICK_SELECTOR)) return
      playUiSound(clickAudioRef.current)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  const onGameHoverSound = useCallback((gameId: number) => {
    if (lastDingGameIdRef.current === gameId) return
    lastDingGameIdRef.current = gameId
    playUiSound(dingAudioRef.current)
  }, [])

  const onGameHoverSoundEnd = useCallback(() => {
    lastDingGameIdRef.current = null
  }, [])

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
      if (t.closest('[data-details-panel]')) return
      if (t.closest('[data-quick-access-modal]')) return
      if (t.closest('[data-hover-card-content]')) return

      setSelectedGameId(null)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setJsonLoaded(false)
      setBgImageLoaded(false)
      setLogoImageLoaded(false)
      const [
        gamesJson,
        categoriesJson,
        quickJson,
        settingsJson,
        clientsJson,
        identityJson,
        linksJson,
        popularJson,
        launchStats,
        tagsJson,
      ] = await Promise.all([
        LoadManagerGamesJSON(),
        LoadManagerCategoriesJSON(),
        LoadManagerQuickAccessJSON(),
        LoadManagerSettingsJSON(),
        LoadManagerClientsJSON(),
        GetClientIdentityJSON(),
        LoadManagerLinksJSON(),
        LoadManagerPopularJSON(),
        LoadManagerLaunchStatsJSON(),
        LoadManagerTagsJSON(),
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

      setPopularRawJson(typeof popularJson === 'string' && popularJson.trim() ? popularJson : '{}')
      setLaunchStatsJson(typeof launchStats === 'string' && launchStats.trim() ? launchStats : '{}')

      try {
        const parsed = JSON.parse(tagsJson) as unknown
        let arr: unknown[] = []
        if (Array.isArray(parsed)) {
          arr = parsed
        } else if (parsed && typeof parsed === 'object') {
          const maybe = (parsed as { tags?: unknown }).tags
          if (Array.isArray(maybe)) arr = maybe
        }

        const normalized: string[] = arr.map((x: unknown) => String(x).trim()).filter(Boolean)
        const uniq = Array.from(new Set(normalized)).sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' })
        )
        setAvailableTags(uniq)
      } catch {
        setAvailableTags([])
      }

      try {
        const parsedSettings = JSON.parse(settingsJson) as ManagerSettings
        setSettings(parsedSettings && typeof parsedSettings === 'object' ? parsedSettings : {})
        if (typeof window !== 'undefined') {
          const s = parsedSettings && typeof parsedSettings === 'object' ? parsedSettings : {}
          applyTheme(s.themeFamilyId, s.themeAppearance)
          syncWailsWindowChrome(s.themeAppearance)
        }
      } catch {
        setSettings({})
        if (typeof window !== 'undefined') {
          applyTheme('vs-blue', 'dark')
          syncWailsWindowChrome('dark')
        }
      }

      // At this point, the "base" JSON is ready; background/logo image effects will flip their loaded flags next.
      setJsonLoaded(true)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setBgImageLoaded(false)
    const relPath = settings.backgroundImage?.trim()
    if (!relPath) {
      setBackgroundImageSrc('')
      setBgImageLoaded(true)
      return
    }
    const url = managerImageAssetUrl(relPath)
    const img = new Image()
    img.onload = () => {
      if (!cancelled) {
        setBackgroundImageSrc(url)
        setBgImageLoaded(true)
      }
    }
    img.onerror = () => {
      if (!cancelled) {
        setBackgroundImageSrc('')
        setBgImageLoaded(true)
      }
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [settings.backgroundImage])

  useEffect(() => {
    let cancelled = false
    setLogoImageLoaded(false)
    const relPath = settings.logoImage?.trim()
    if (!relPath) {
      setLogoImageSrc('')
      setLogoImageLoaded(true)
      return
    }
    const url = managerImageAssetUrl(relPath)
    const img = new Image()
    img.onload = () => {
      if (!cancelled) {
        setLogoImageSrc(url)
        setLogoImageLoaded(true)
      }
    }
    img.onerror = () => {
      if (!cancelled) {
        setLogoImageSrc('')
        setLogoImageLoaded(true)
      }
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [settings.logoImage])

  const iconSize: IconSize = settings.gameIconSize === 'small' || settings.gameIconSize === 'large' ? settings.gameIconSize : 'medium'
  const sortOrder = settings.gameOrder === 'Z-A' ? 'Z-A' : 'A-Z'
  const shopName = settings.shopName?.trim() || 'EZJR Game Client'
  /** Sidebar tiles use fixed tag layout; legacy settings.tagsPosition is ignored. */
  const tagsPosition = 'top-left'
  const showTags = settings.showTags !== false
  const showCategoryIcons = settings.showCategoryIcons !== false
  const showQuickAccess = settings.showQuickAccess !== false
  const showQuickAccessTitle = settings.showQuickAccessTitle !== false
  const showPopularStrip = settings.showPopularStrip !== false
  const showGameDetailsSidebar = settings.showGameDetailsSidebar !== false
  const detailFeatureEnabled = showGameDetailsSidebar
  const detailColumnActive = detailFeatureEnabled && detailPanelOpen
  const showFooter = settings.showFooter !== false
  const isLightMode = settings.themeAppearance === 'light'
  const whenLaunchingMode: 'minimized' | 'normal' | 'exit' =
    settings.whenLaunchingGame === 'minimized' ||
      settings.whenLaunchingGame === 'normal' ||
      settings.whenLaunchingGame === 'exit'
      ? settings.whenLaunchingGame
      : 'normal'

  const visibleGames = useMemo(
    () => games.filter((g) => isGameVisibleToClient(g, clientIdentity, managerClients)),
    [games, clientIdentity, managerClients],
  )

  const allTags = useMemo(() => {
    if (availableTags.length > 0) return availableTags
    const uniq = new Set<string>()
    for (const g of visibleGames) {
      for (const t of g.tags ?? []) {
        const tt = String(t).trim()
        if (tt) uniq.add(tt)
      }
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [availableTags, visibleGames])

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
    const query = searchInput.trim().toLowerCase()
    const base = visibleGames.filter((g) => {
      if (activeTab !== 'ALL') {
        const cats = parseMulti(g.category)
        if (!cats.includes(activeTab)) return false
      }
      if (selectedTags.length > 0) {
        const set = new Set((g.tags ?? []).map((t) => String(t)))
        if (!selectedTags.some((t) => set.has(t))) return false
      }
      if (!query) return true
      return `${g.name} ${g.category} ${g.tags?.join(' ') ?? ''}`.toLowerCase().includes(query)
    })

    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return sortOrder === 'Z-A' ? sorted.reverse() : sorted
  }, [visibleGames, activeTab, searchInput, sortOrder, selectedTags])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: visibleGames.length }
    for (const g of visibleGames) {
      for (const part of parseMulti(g.category)) {
        counts[part] = (counts[part] ?? 0) + 1
      }
    }
    return counts
  }, [visibleGames])

  const popularIdOrder = useMemo(() => parsePopularGameIds(popularRawJson), [popularRawJson])

  const launchCounts = useMemo(() => parseLaunchOpens(launchStatsJson), [launchStatsJson])

  const popularGames = useMemo(() => {
    const map = new Map<number, ManagerGame>()
    visibleGames.forEach((g) => map.set(g.id, g))
    const ordered: ManagerGame[] = []
    for (const id of popularIdOrder) {
      const g = map.get(id)
      if (g) ordered.push(g)
    }
    const byOpensThenName = [...visibleGames].sort((a, b) => {
      const oa = launchCounts.get(a.id) ?? 0
      const ob = launchCounts.get(b.id) ?? 0
      if (ob !== oa) return ob - oa
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    for (const g of byOpensThenName) {
      if (ordered.length >= 5) break
      if (!ordered.some((x) => x.id === g.id)) ordered.push(g)
    }
    return ordered.slice(0, 5)
  }, [visibleGames, popularIdOrder, launchCounts])

  const quickAccessGames = useMemo(() => {
    const map = new Map<number, ManagerGame>()
    visibleGames.forEach((g) => map.set(g.id, g))
    return quickAccessIds.map((id) => map.get(id)).filter(Boolean) as ManagerGame[]
  }, [visibleGames, quickAccessIds])

  const selectedGame = useMemo(() => {
    if (selectedGameId == null) return null
    return visibleGames.find((g) => g.id === selectedGameId) ?? null
  }, [visibleGames, selectedGameId])

  const scrollQuickAccess = useCallback((dir: 'left' | 'right') => {
    const el = quickAccessScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -140 : 140, behavior: 'smooth' })
  }, [])

  /** In-app only: native MessageBox/TaskDialog in fullscreen WebView2 can crash the host with no visible prompt. */
  function showLaunchError(title: string, message: string, game?: ManagerGame) {
    let iconSrc: string | undefined
    const gameName = game?.name?.trim()
    if (game) {
      const rel = (game.exeIconRelPath ?? '').trim() || (game.coverRelPath ?? '').trim()
      if (rel) iconSrc = managerImageAssetUrl(rel)
    }
    setLaunchDialog({ title, message, iconSrc, gameName })
  }

  async function recordLaunchStats(gameId: number) {
    try {
      await RecordGameLaunch(gameId)
      const j = await LoadManagerLaunchStatsJSON()
      setLaunchStatsJson(j?.trim() ? j : '{}')
    } catch {
      /* ignore: read-only share, permission, etc. */
    }
  }

  /** Runs only after a URL/game was started successfully — never on failed launch or missing path. */
  function applyAfterLaunchBehavior() {
    if (whenLaunchingMode === 'exit') {
      Quit()
    } else if (whenLaunchingMode === 'minimized') {
      WindowMinimise()
    }
  }

  async function handleLaunchGame(game: ManagerGame, opts?: { force?: boolean }) {
    try {
      if (!opts?.force) {
        const pid = runningGamePidsRef.current.get(game.id)
        if (pid && pid > 0) {
          const running = await IsProcessRunning(pid)
          if (running) {
            setAlreadyRunningDialogGame(game)
            return
          }
          runningGamePidsRef.current.delete(game.id)
          saveRunningGamePids()
        }
      }

      const preLaunchPath = (game.preLaunchScriptPath ?? '').trim()
      const launchType: 'exe' | 'script' = game.launchType === 'script' ? 'script' : 'exe'
      // Back-compat: older configs might store a .bat/.cmd/.ps1 path in `exePath`
      // without having `scriptPath` populated.
      const launchPathRaw = launchType === 'script' ? (game.scriptPath ?? game.exePath) : game.exePath
      const launchPath = (launchPathRaw ?? '').trim()

      if (!launchPath) {
        await showLaunchError(
          'Unable to launch game',
          `"${game.name}" has no ${launchType === 'script' ? 'script' : 'launch'} path configured. Add it in Game Manager.`,
          game
        )
        return
      }

      if (/^https?:\/\//i.test(launchPath)) {
        BrowserOpenURL(launchPath)
        void recordLaunchStats(game.id)
        applyAfterLaunchBehavior()
        return
      }

      try {
        if (preLaunchPath) {
          if (/^https?:\/\//i.test(preLaunchPath)) {
            BrowserOpenURL(preLaunchPath)
          } else {
            await LaunchGameBlocking(preLaunchPath, '')
          }
        }

        const pid = await LaunchGameWithPID(launchPath, game.args ?? '')
        if (pid && pid > 0) {
          runningGamePidsRef.current.set(game.id, pid)
          saveRunningGamePids()
        }
        void recordLaunchStats(game.id)
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

  const shouldShowLoader =
    !jsonLoaded ||
    (settings.backgroundImage?.trim() ? !bgImageLoaded : false) ||
    (settings.logoImage?.trim() ? !logoImageLoaded : false)

  const loaderMessage = !jsonLoaded ? 'Loading menu data…' : 'Loading images…'
  const activeTabLabel = activeTab === 'ALL' ? 'All Games' : activeTab

  return (
    <div
      className="relative isolate flex h-screen w-screen flex-col overflow-hidden bg-theme-app bg-cover bg-center bg-no-repeat font-sans text-[13px] text-theme-text antialiased selection:bg-theme-primary/35"
      style={backgroundImageSrc ? { backgroundImage: `url("${backgroundImageSrc}")` } : undefined}
    >
      <Head>
        <title>Game Menu</title>
      </Head>

      {shouldShowLoader ? (
        <div
          className="absolute inset-0 z-[120] flex items-center justify-center p-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className={cn(
            'w-full max-w-[28rem] rounded-2xl border p-6 backdrop-blur-xl',
            isLightMode
              ? 'border-black/8 bg-theme-sidebar/60 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.18)]'
              : 'border-white/10 bg-theme-sidebar/45 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.55)]',
          )}>
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 animate-spin rounded-full border-4 border-theme-muted/40 border-t-theme-primary/80"
                aria-hidden
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-theme-text">{loaderMessage}</div>
                <div className="mt-1 text-xs text-theme-muted">
                  This can take a moment while the launcher reads local configuration.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {backgroundImageSrc ? (
        <div className={cn(
          'pointer-events-none absolute inset-0 z-0 bg-gradient-to-br',
          isLightMode
            ? 'from-theme-app/40 via-theme-app/28 to-theme-app/55 backdrop-blur-[8px]'
            : 'from-theme-app/88 via-theme-app/72 to-theme-app/[0.97] backdrop-blur-[3px]',
        )} />
      ) : (
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgb(var(--color-primary-button)/0.14),transparent_55%),linear-gradient(180deg,rgb(var(--color-app-background))_0%,rgb(var(--color-sidebar))_45%,rgb(var(--color-app-background))_100%)]" />
      )}
      <div className={cn(
        'pointer-events-none absolute inset-0 z-0',
        isLightMode
          ? 'bg-[radial-gradient(ellipse_at_70%_20%,rgba(255,255,255,0.08),transparent_50%),radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.1)_100%)]'
          : 'bg-[radial-gradient(ellipse_at_80%_0%,rgb(var(--color-primary-button)/0.12),transparent_42%),radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]',
      )} />
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.035] [background-image:repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.06)_2px,rgba(255,255,255,0.06)_3px)]"
        aria-hidden
      />

      <div
        className={cn(
          'relative z-10 grid min-h-0 min-w-0 w-full flex-1',
          showFooter
            ? detailColumnActive
              ? "[grid-template-rows:52px_1fr_minmax(34px,auto)] [grid-template-areas:'header_header_header'_'sidebar_main_detail'_'footer_footer_footer']"
              : "[grid-template-rows:52px_1fr_minmax(34px,auto)] [grid-template-areas:'header_header'_'sidebar_main'_'footer_footer']"
            : detailColumnActive
              ? "[grid-template-rows:52px_1fr] [grid-template-areas:'header_header_header'_'sidebar_main_detail']"
              : "[grid-template-rows:52px_1fr] [grid-template-areas:'header_header'_'sidebar_main']",
          detailColumnActive ? 'grid-cols-[220px_1fr_minmax(260px,320px)]' : 'grid-cols-[220px_1fr]',
        )}
      >
        <header
          className={cn(
            'wails-drag [grid-area:header] flex h-[52px] min-h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.07] px-4',
            isLightMode ? 'bg-theme-sidebar/90' : 'bg-theme-sidebar/95',
          )}
        >
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {logoImageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                draggable={false}
                src={logoImageSrc}
                alt={shopName}
                className="max-h-9 w-auto max-w-[min(220px,36vw)] object-contain"
              />
            ) : (
              <>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-theme-primary shadow-[0_0_8px] shadow-theme-primary/70"
                  aria-hidden
                />
                <span className="font-display truncate text-xl font-extrabold tracking-[0.04em] text-theme-text">
                  {shopName}
                </span>
              </>
            )}
          </div>
          <div className="wails-no-drag mx-auto flex min-w-0 flex-1 items-center justify-center">
            <div className="relative w-full min-w-0 max-w-[420px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-theme-muted"
                aria-hidden
              />
              <Input
                className={cn(
                  'h-8 min-w-0 w-full rounded-full border py-0 pl-9 pr-3 text-xs transition-[box-shadow,background,border-color] placeholder:text-theme-muted focus-visible:border-theme-primary/40 focus-visible:ring-1 focus-visible:ring-theme-primary/30',
                  isLightMode
                    ? 'border-black/10 bg-theme-card/75'
                    : 'border-white/[0.07] bg-white/[0.05]',
                )}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search games, tags, categories…"
                aria-label="Search games"
              />
            </div>
          </div>
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 md:gap-3">
            <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
              {headerLinks.map((link) => (
                <HeaderLinkButton key={link.id} link={link} />
              ))}
            </div>
            {detailFeatureEnabled ? (
              <button
                type="button"
                className={cn(
                  'wails-no-drag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                  detailPanelOpen
                    ? 'border-theme-primary/35 bg-theme-primary/10 text-theme-primary'
                    : 'border-white/[0.08] text-theme-muted hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-theme-text',
                )}
                onClick={() => setDetailPanelOpen((o) => !o)}
                aria-expanded={detailPanelOpen}
                aria-label={detailPanelOpen ? 'Hide game details panel' : 'Show game details panel'}
              >
                <PanelRight className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </header>

        <aside
          className={cn(
            '[grid-area:sidebar] flex min-h-0 flex-col overflow-hidden border-r border-white/[0.07]',
            isLightMode ? 'bg-theme-sidebar/95' : 'bg-theme-sidebar/90',
          )}
        >

          <div className="px-3 pb-1.5 pt-3.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-theme-muted/80">
            Categories
          </div>
          <div
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Game categories"
          >
            {tabItems.map((tab) => {
              const active = activeTab === tab.key
              const count = categoryCounts[tab.key] ?? 0
              const label = tab.key === 'ALL' ? 'All' : tab.label
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[10px] border px-3.5 py-1.5 text-left text-xs font-medium transition-colors',
                    'outline outline-none focus-visible:outline-2 focus-visible:outline-theme-primary/50 ring-0 outline-offset-0',
                    active
                      ? 'border-white/[0.13] bg-white/[0.06] font-semibold text-theme-text'
                      : 'border-transparent text-theme-muted hover:bg-white/[0.04] hover:text-theme-text',
                  )}
                >
                  {showCategoryIcons ? (
                    tab.key === 'ALL' ? (
                      <LayoutGrid className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    ) : (
                      <CategoryTabIcon relPath={tab.iconRelPath} />
                    )
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                      active ? 'bg-theme-primary/12 text-theme-primary' : 'bg-white/[0.06] text-theme-muted',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          {showQuickAccess && quickAccessGames.length > 0 ? (
            <>
              <div className="mx-3 my-2 h-px bg-theme-border" aria-hidden />
              {showQuickAccessTitle ? (
                <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-1">
                  <div className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-theme-muted/80">
                    Quick access
                  </div>
                  {quickAccessGames.length > 2 ? (
                    <button
                      type="button"
                      className="wails-no-drag shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium text-theme-primary hover:bg-white/[0.06]"
                      onClick={() => setQuickAccessSeeAllOpen(true)}
                    >
                      See all
                    </button>
                  ) : null}
                </div>
              ) : quickAccessGames.length > 2 ? (
                <div className="flex justify-end px-3 pb-1 pt-1">
                  <button
                    type="button"
                    className="wails-no-drag text-[9px] font-medium text-theme-primary hover:bg-white/[0.06] rounded-md px-1.5 py-0.5"
                    onClick={() => setQuickAccessSeeAllOpen(true)}
                  >
                    See all
                  </button>
                </div>
              ) : null}
              <div className="flex items-stretch gap-0.5 px-2 pb-3 pt-1">
                {/* <button
                  type="button"
                  className="wails-no-drag flex w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-theme-muted transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-theme-text"
                  aria-label="Scroll quick access left"
                  onClick={() => scrollQuickAccess('left')}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button> */}
                <div
                  ref={quickAccessScrollRef}
                  className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {quickAccessGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="flex w-[52px] shrink-0 flex-col items-center gap-1 rounded-lg border border-transparent p-1 transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] outline outline-none focus-visible:outline-2 focus-visible:outline-theme-primary/50 ring-0 outline-offset-0"
                      aria-label={g.name}
                      title={`${g.name} — Double-click to launch`}
                      onClick={() => setSelectedGameId(g.id)}
                      onMouseEnter={() => onGameHoverSound(g.id)}
                      onMouseLeave={onGameHoverSoundEnd}
                      onDoubleClick={() => void handleLaunchGame(g)}
                    >
                      <GameArtwork
                        quickAccess
                        className="!border-none !bg-transparent !shadow-none"
                        game={g}
                        iconSize="small"
                        tagsPosition={tagsPosition}
                        showTags={false}
                      />
                      <span className="w-full truncate text-center text-[9px] text-theme-muted">{g.name}</span>
                    </button>
                  ))}
                </div>
                {/* <button
                  type="button"
                  className="wails-no-drag flex w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-theme-muted transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-theme-text"
                  aria-label="Scroll quick access right"
                  onClick={() => scrollQuickAccess('right')}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button> */}
              </div>
            </>
          ) : null}
        </aside>

        <main
          className={cn(
            '[grid-area:main] flex min-h-0 min-w-0 flex-col overflow-hidden',
            'bg-[radial-gradient(ellipse_60%_40%_at_70%_0%,rgb(var(--color-primary-button)/0.06),transparent_60%),radial-gradient(ellipse_40%_60%_at_0%_100%,rgba(245,158,11,0.04),transparent_50%)]',
            isLightMode ? 'bg-theme-app/80' : 'bg-theme-app',
          )}
        >
          {showPopularStrip && popularGames.length > 0 ? (
            <div className="shrink-0 border-b border-white/[0.07] px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-display text-xs font-bold uppercase tracking-[0.1em] text-theme-muted">Popular right now</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-theme-warning/25 bg-theme-warning/10 px-2 py-0.5 text-[10px] font-semibold text-theme-warning">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-theme-warning" aria-hidden />
                  Live
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20">
                {popularGames.map((g, i) => (
                  <button
                    key={g.id}
                    type="button"
                    className="group relative flex h-[118px] w-[min(260px,72vw)] shrink-0 flex-col cursor-pointer overflow-hidden rounded-[14px] border border-white/[0.07] bg-theme-card text-left transition-all hover:-translate-y-0.5 hover:border-white/[0.13] outline outline-none focus-visible:outline-2 focus-visible:outline-theme-primary/50 ring-0"
                    title={g.name}
                    onClick={() => setSelectedGameId(g.id)}
                    onDoubleClick={() => void handleLaunchGame(g)}
                  >
                    <div className="relative h-[70px] w-full shrink-0">
                      <PopularPopArt game={g} />
                      <span
                        className={cn(
                          'absolute left-1.5 top-1.5 rounded border border-white/10 bg-black/70 px-1.5 py-0.5 font-display text-[11px] font-extrabold text-theme-text backdrop-blur-sm',
                          i < 3 ? 'text-theme-warning' : '',
                        )}
                      >
                        #{i + 1}
                      </span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col px-2 py-1.5">
                      <div className="mb-0.5 line-clamp-1 truncate text-[11px] font-semibold text-theme-text">
                        {g.name}
                      </div>
                      <div className="mt-auto flex items-center gap-1 text-[10px] text-theme-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-theme-success" aria-hidden />
                        {(() => {
                          const opens = launchCounts.get(g.id) ?? 0
                          return opens > 0
                            ? `Played ${opens > 1 ? opens : ''}${opens > 1 ? ' times' : 'once'}`
                            : 'Not played yet'
                        })()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 py-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-display text-[15px] font-bold tracking-wide text-theme-text">{activeTabLabel}</span>
              <span className="rounded-full border border-theme-primary/20 bg-theme-primary/10 px-2 py-0.5 font-display text-xs font-semibold tabular-nums text-theme-primary">
                {filteredGames.length}
              </span>
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={cn(
                      'h-7 rounded-full px-2.5 text-[11px]',
                      selectedTags.length > 0 && 'border-theme-primary/25 bg-theme-primary/10'
                    )}
                    aria-label="Filter by tags"
                  >
                    <Tags className="h-3.5 w-3.5" aria-hidden />
                    Tags
                    {selectedTags.length > 0 ? (
                      <span className="ml-0.5 rounded-full bg-theme-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-theme-primary">
                        {selectedTags.length}
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  <Command>
                    <CommandInput placeholder="Search tags…" />
                    <CommandList>
                      <CommandEmpty>No tags found.</CommandEmpty>
                      <CommandGroup heading="Tags">
                        {allTags.map((tag) => {
                          const selected = selectedTags.includes(tag)
                          return (
                            <CommandItem
                              key={tag}
                              onSelect={() => {
                                setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
                              }}
                            >
                              <span
                                className={cn(
                                  'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-theme-border',
                                  selected && 'border-theme-primary/40 bg-theme-primary/15 text-theme-primary',
                                )}
                                aria-hidden
                              >
                                {selected ? <Check className="h-3 w-3" /> : null}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{tag}</span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {selectedTags.length > 0 ? (
                    <div className="flex items-center justify-between border-t border-theme-border p-2">
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-xs text-theme-muted hover:bg-white/[0.06] hover:text-theme-text"
                        onClick={() => setSelectedTags([])}
                      >
                        Clear
                      </button>
                      <span className="text-[10px] text-theme-muted">{selectedTags.length} selected</span>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
              <span className="ml-auto text-[10px] text-theme-muted/90">Double-click to launch</span>
            </div>
            <div
              ref={libraryGridRef}
              onScroll={(e) => setLibraryGridScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
              className="relative min-h-0 flex-1 p-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
            >
              {(() => {
                const w = libraryGridWidthPx ?? 0
                const h = libraryGridHeightPx ?? 0
                const gapPx = 10
                const minTileWidthPx =
                  iconSize === 'small' ? 96 : iconSize === 'large' ? 120 : 105
                const rowHeightPx =
                  iconSize === 'small' ? 88 : iconSize === 'large' ? 212 : 188

                const usableWidth = Math.max(0, w - 8)
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
                      const artH = iconSize === 'large' ? 150 : iconSize === 'small' ? 40 : 130
                      return (
                        <div
                          key={game.id}
                          className="tile-pop-in"
                          style={{
                            position: 'absolute',
                            top: row * rowHeightPx,
                            left: col * (tileWidth + gapPx),
                            width: tileWidth,
                            height: rowHeightPx,
                            paddingBottom: gapPx,
                            animationDelay: `${Math.min(i * 30, 400)}ms`,
                          }}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            data-game-tile
                            className={cn(
                              'group relative flex h-auto w-full min-w-0 flex-col items-stretch gap-0 overflow-hidden border !p-0',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-theme-app',
                              selected &&
                              'border-theme-primary shadow-[0_0_0_1px_rgb(var(--color-primary-button)),0_8px_24px_-8px_rgb(var(--color-primary-button)/0.25)]',
                              isLightMode
                                ? 'border-black/[0.07] bg-theme-card/50 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)]'
                                : 'border-white/[0.07] bg-theme-card/90 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)]',
                              isLightMode
                                ? 'hover:-translate-y-0.5 hover:border-theme-primary/30 hover:bg-theme-card/80'
                                : 'hover:-translate-y-1 hover:border-theme-primary/30 hover:bg-theme-card hover:shadow-[0_12px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgb(var(--color-primary-button)/0.1)]',
                              'rounded-[14px]',
                              iconSize === 'small' && 'pt-2',
                            )}
                            onClick={() => setSelectedGameId(game.id)}
                            onMouseEnter={() => onGameHoverSound(game.id)}
                            onMouseLeave={onGameHoverSoundEnd}
                            onDoubleClick={() => void handleLaunchGame(game)}
                            onKeyUp={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setSelectedGameId(game.id)
                                void handleLaunchGame(game)
                              } else if (e.key === 'Escape') {
                                setSelectedGameId(null)
                              }
                            }}
                          >

                            <div className="relative flex w-full min-w-0 max-w-full flex-col items-stretch">
                              {showTags && game.tags?.length ? (
                                <div className="flex flex-1 absolute left-1 top-1 z-10 gap-1 flex-wrap">
                                  {game.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded px-1.5 py-0.5 text-[9px] text-theme-text bg-theme-secondary/90"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <GameArtwork
                                fillTile
                                game={game}
                                iconSize={iconSize}
                                tagsPosition={tagsPosition}
                                showTags={false}
                              />
                              {/* {iconSize !== 'small' ? (
                                <div
                                  className="pointer-events-none absolute left-0 right-0 top-0 z-[6] flex items-end justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                  style={{ height: artH, paddingBottom: 10 }}
                                  aria-hidden
                                >
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    className="pointer-events-auto relative flex h-9 w-9 items-center justify-center my-auto rounded-full bg-theme-primary text-theme-app shadow-lg transition-transform group-hover:scale-105"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedGameId(game.id)
                                      void handleLaunchGame(game)
                                    }}
                                  >
                                    <Play className="ml-0.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
                                  </button>
                                </div>
                              ) : null} */}
                            </div>
                            <div className="flex flex-1 flex-col gap-1 px-2 pb-2 pt-1.5">
                              <GameTileTitle name={game.name} selected={selected} />
                            </div>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </main>
        {detailColumnActive ? (
          <GameDetailsSidebar
            game={selectedGame}
            isLightMode={isLightMode}
            onCollapse={() => setDetailPanelOpen(false)}
            onPlay={(g) => void handleLaunchGame(g)}
          />
        ) : null}
        {showFooter ? (
          <footer
            className={cn(
              '[grid-area:footer] flex h-[34px] min-h-[34px] items-center gap-3 border-t border-white/[0.07] px-4 text-[11px]',
              isLightMode ? 'bg-theme-sidebar/90' : 'bg-theme-sidebar/95',
            )}
          >
            <div className="flex shrink-0 items-center gap-1.5 font-display text-xs font-bold tracking-wide text-theme-primary">
              <span
                className="h-1.5 w-1.5 rounded-full bg-theme-success shadow-[0_0_6px] shadow-theme-success/80"
                aria-hidden
              />
              {computerName}
            </div>
            <div className="h-3.5 w-px shrink-0 bg-theme-border" aria-hidden />
            <div className="min-w-0 flex-1 overflow-hidden">
              <span className="launcher-footer-ticker inline-block text-theme-muted">
                {settings.runningText?.trim() || 'Powered by EZJR'}
              </span>
            </div>
            <time className="shrink-0 tabular-nums text-theme-muted" dateTime={now.toISOString()}>
              {`${date} · ${time}`}
            </time>
          </footer>
        ) : null}
      </div>

      {quickAccessSeeAllOpen && quickAccessGames.length > 0 ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Quick access — all shortcuts">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={() => setQuickAccessSeeAllOpen(false)}
          />
          <div
            className={cn(
              'relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl',
              isLightMode
                ? 'border-black/10 bg-theme-card/95'
                : 'border-white/[0.1] bg-theme-sidebar/95',
            )}
          >
            <div className="flex items-center justify-between border-b border-theme-border px-4 py-3">
              <span className="font-display text-sm font-bold text-theme-text">Quick access</span>
              <button
                type="button"
                className="wails-no-drag flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:bg-white/[0.06] hover:text-theme-text"
                onClick={() => setQuickAccessSeeAllOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4 [scrollbar-width:thin]">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3">
                {quickAccessGames.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/40"
                    onMouseEnter={() => onGameHoverSound(g.id)}
                    onMouseLeave={onGameHoverSoundEnd}
                    onDoubleClick={() => {
                      setQuickAccessSeeAllOpen(false)
                      void handleLaunchGame(g)
                    }}
                  >
                    <GameArtwork
                      quickAccess
                      className="!border-none !bg-transparent !shadow-none w-full max-w-[52px]"
                      game={g}
                      iconSize="small"
                      tagsPosition={tagsPosition}
                      showTags={false}
                    />
                    <span className="line-clamp-2 w-full text-center text-[9px] text-theme-muted">{g.name}</span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-center text-[10px] text-theme-muted">Double-click a game to launch.</p>
            </div>
          </div>
        </div>
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
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
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

      <AlertDialog
        open={alreadyRunningDialogGame !== null}
        onOpenChange={(open) => {
          if (!open) setAlreadyRunningDialogGame(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex gap-4 sm:items-start">
              {(() => {
                const g = alreadyRunningDialogGame
                const rel = (g?.exeIconRelPath ?? '').trim() || (g?.coverRelPath ?? '').trim()
                const iconSrc = rel ? managerImageAssetUrl(rel) : ''
                return iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={iconSrc}
                    alt={g?.name ?? ''}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-sidebar"
                    aria-hidden
                  >
                    <Gamepad2 className="h-7 w-7 text-theme-muted" />
                  </div>
                )
              })()}
              <div className="min-w-0 flex-1 space-y-2 text-left">
                <AlertDialogTitle>Game is already running</AlertDialogTitle>
                <AlertDialogDescription className="whitespace-pre-wrap">
                  {alreadyRunningDialogGame
                    ? `"${alreadyRunningDialogGame.name}" is already running.\n\nRun anyway?`
                    : ''}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault()
                const g = alreadyRunningDialogGame
                setAlreadyRunningDialogGame(null)
                if (g) void handleLaunchGame(g, { force: true })
              }}
            >
              Run anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
