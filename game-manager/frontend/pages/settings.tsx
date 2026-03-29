import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { saveSettings, loadSettings, type Settings as StoredSettings } from '@/lib/settings-storage'
import { hasWailsApp } from '@/lib/games-storage'
import { yieldForNativeFileDialog } from '@/lib/yield-for-native-file-dialog'
import { QuickAccessEditor } from '@/components/quick-access-editor'
import {
  GetWindowsStartupStatus,
  ImportSettingsImage as ImportSettingsImageWails,
  PickImageFile as PickImageFileWails,
  SetLaunchOnWindowsStartup,
} from '@/wailsjs/wailsjs/go/main/App'
import { cn } from '@/lib/utils'

/**
 * Stored as `{edge}-{secondary}`:
 * - TOP/BOTTOM → `left` | `center` | `right` (e.g. `top-left`)
 * - LEFT/RIGHT → `upper` | `center` | `lower` (e.g. `left-center`)
 * Migrates older `top-upper`-style and corner keys.
 */
type LayoutEdge = 'top' | 'bottom' | 'left' | 'right'

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

function tryCanonicalLayoutPosition(raw: string | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  let v = String(raw).trim().toLowerCase()
  if (LEGACY_CORNER_TO_UNIFIED[v]) v = LEGACY_CORNER_TO_UNIFIED[v]
  if (OLD_HORIZONTAL_AXIS[v]) v = OLD_HORIZONTAL_AXIS[v]
  if (/^(top|bottom)-(left|center|right)$/.test(v)) return v
  if (/^(left|right)-(upper|center|lower)$/.test(v)) return v
  return null
}

function migrateLayoutPosition(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return tryCanonicalLayoutPosition(raw)
}

function normalizeLayoutPositionValue(value: string | undefined, fallback: string): string {
  return tryCanonicalLayoutPosition(value) ?? tryCanonicalLayoutPosition(fallback) ?? 'top-left'
}

function parseEdgeSecondary(combined: string, fallback: string): { edge: LayoutEdge; secondary: string } {
  const migrated = normalizeLayoutPositionValue(combined, fallback)
  const [e, s] = migrated.split('-')
  const edge = (['top', 'bottom', 'left', 'right'].includes(e) ? e : 'top') as LayoutEdge
  if (edge === 'top' || edge === 'bottom') {
    const secondary = ['left', 'center', 'right'].includes(s) ? s : 'left'
    return { edge, secondary }
  }
  const secondary = ['upper', 'center', 'lower'].includes(s) ? s : 'center'
  return { edge, secondary }
}

function combineLayoutPosition(edge: LayoutEdge, secondary: string): string {
  return `${edge}-${secondary}`
}

function mapSecondaryWhenEdgeChanges(prevEdge: LayoutEdge, nextEdge: LayoutEdge, secondary: string): string {
  const prevH = prevEdge === 'top' || prevEdge === 'bottom'
  const nextH = nextEdge === 'top' || nextEdge === 'bottom'
  if (prevH === nextH) return secondary
  if (prevH && !nextH) {
    const m: Record<string, string> = { left: 'upper', center: 'center', right: 'lower' }
    return m[secondary] ?? 'center'
  }
  const m: Record<string, string> = { upper: 'left', center: 'center', lower: 'right' }
  return m[secondary] ?? 'center'
}

function EdgeAlignSelect({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const { edge, secondary } = parseEdgeSecondary(value, 'top-left')
  const isHorizontalEdge = edge === 'top' || edge === 'bottom'

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={edge}
        onValueChange={(v) => {
          const nextEdge = v as LayoutEdge
          const nextSecondary = mapSecondaryWhenEdgeChanges(edge, nextEdge, secondary)
          onChange(combineLayoutPosition(nextEdge, nextSecondary))
        }}
        disabled={disabled}
      >
        <SelectTrigger id={`${idPrefix}-edge`} className="min-w-[8.5rem]">
          <SelectValue placeholder="Edge" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="top">Top</SelectItem>
          <SelectItem value="bottom">Bottom</SelectItem>
          <SelectItem value="left">Left</SelectItem>
          <SelectItem value="right">Right</SelectItem>
        </SelectContent>
      </Select>
      {isHorizontalEdge ? (
        <Select
          value={secondary}
          onValueChange={(v) => onChange(combineLayoutPosition(edge, v))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-h`} className="min-w-[8.5rem]">
            <SelectValue placeholder="Align" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Select
          value={secondary}
          onValueChange={(v) => onChange(combineLayoutPosition(edge, v))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-v`} className="min-w-[8.5rem]">
            <SelectValue placeholder="Align" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="upper">Upper</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="lower">Lower</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [hydrated, setHydrated] = useState(false)

  const [shopName, setShopName] = useState('')
  const [gameOrder, setGameOrder] = useState<'A-Z' | 'Z-A'>('A-Z')
  const [whenLaunchingGame, setWhenLaunchingGame] = useState<'minimized' | 'normal' | 'exit'>('normal')
  const [gameIconSize, setGameIconSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [categoryPosition, setCategoryPosition] = useState('top-left')
  const [showCategoryIcons, setShowCategoryIcons] = useState(true)
  const [quickAccessPosition, setQuickAccessPosition] = useState('right-center')
  const [tagsPosition, setTagsPosition] = useState('top-left')
  const [showTags, setShowTags] = useState(true)
  const [showQuickAccess, setShowQuickAccess] = useState(true)
  const [showQuickAccessTitle, setShowQuickAccessTitle] = useState(true)
  const [showFooter, setShowFooter] = useState(true)
  const [runningText, setRunningText] = useState('')
  const [launchOnWindowsStartup, setLaunchOnWindowsStartup] = useState(false)

  const [backgroundImagePath, setBackgroundImagePath] = useState('')
  const [logoImagePath, setLogoImagePath] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const stored = await loadSettings()
        if (cancelled) return

        const rawShopName = (stored as Record<string, unknown>).shopName
        if (typeof rawShopName === 'string') setShopName(rawShopName)

        const rawGameOrder = (stored as Record<string, unknown>).gameOrder
        if (rawGameOrder === 'A-Z' || rawGameOrder === 'Z-A') setGameOrder(rawGameOrder)

        const rawLaunch = (stored as Record<string, unknown>).whenLaunchingGame
        if (rawLaunch === 'minimized' || rawLaunch === 'normal' || rawLaunch === 'exit') setWhenLaunchingGame(rawLaunch)

        const rawStartup = (stored as Record<string, unknown>).launchOnWindowsStartup
        if (typeof rawStartup === 'boolean') setLaunchOnWindowsStartup(rawStartup)

        const rawIconSize = (stored as Record<string, unknown>).gameIconSize
        if (rawIconSize === 'small' || rawIconSize === 'medium' || rawIconSize === 'large') setGameIconSize(rawIconSize)

        const rawCategoryPos = (stored as Record<string, unknown>).categoryPosition
        const catM = migrateLayoutPosition(rawCategoryPos)
        if (catM) setCategoryPosition(catM)

        const rawShowCategoryIcons = (stored as Record<string, unknown>).showCategoryIcons
        if (typeof rawShowCategoryIcons === 'boolean') setShowCategoryIcons(rawShowCategoryIcons)

        const rawQuickPos = (stored as Record<string, unknown>).quickAccessPosition
        const quickM = migrateLayoutPosition(rawQuickPos)
        if (quickM) setQuickAccessPosition(quickM)

        const rawTagsPos = (stored as Record<string, unknown>).tagsPosition
        const tagsM = migrateLayoutPosition(rawTagsPos)
        if (tagsM) setTagsPosition(tagsM)

        const rawShowTags = (stored as Record<string, unknown>).showTags
        if (typeof rawShowTags === 'boolean') setShowTags(rawShowTags)

        const rawShowQuickAccess = (stored as Record<string, unknown>).showQuickAccess
        if (typeof rawShowQuickAccess === 'boolean') setShowQuickAccess(rawShowQuickAccess)

        const rawShowQuickAccessTitle = (stored as Record<string, unknown>).showQuickAccessTitle
        if (typeof rawShowQuickAccessTitle === 'boolean') setShowQuickAccessTitle(rawShowQuickAccessTitle)

        const rawShowFooter = (stored as Record<string, unknown>).showFooter
        if (typeof rawShowFooter === 'boolean') setShowFooter(rawShowFooter)

        const rawRunningText = (stored as Record<string, unknown>).runningText
        if (typeof rawRunningText === 'string') setRunningText(rawRunningText)

        const rawBg = (stored as Record<string, unknown>).backgroundImage
        if (typeof rawBg === 'string') setBackgroundImagePath(rawBg)

        const rawLogo = (stored as Record<string, unknown>).logoImage
        if (typeof rawLogo === 'string') setLogoImagePath(rawLogo)

        try {
          const st = await GetWindowsStartupStatus()
          if (st === 'on' || st === 'off') setLaunchOnWindowsStartup(st === 'on')
        } catch {
          // non-Windows or Wails unavailable; keep value from settings.json
        }
      } catch {
        // ignore; keep defaults
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const canSave = hydrated && hasWailsApp()

  const savePayload = useMemo(
    () => ({
      shopName,
      gameOrder,
      whenLaunchingGame,
      gameIconSize,
      categoryPosition,
      showCategoryIcons,
      quickAccessPosition,
      tagsPosition,
      showTags,
      showQuickAccess,
      showQuickAccessTitle,
      showFooter,
      runningText,
      launchOnWindowsStartup,
      backgroundImage: backgroundImagePath || undefined,
      logoImage: logoImagePath || undefined,
    }),
    [
      shopName,
      gameOrder,
      whenLaunchingGame,
      gameIconSize,
      categoryPosition,
      showCategoryIcons,
      quickAccessPosition,
      tagsPosition,
      showTags,
      showQuickAccess,
      showQuickAccessTitle,
      showFooter,
      runningText,
      launchOnWindowsStartup,
      backgroundImagePath,
      logoImagePath,
    ]
  )

  useEffect(() => {
    if (!canSave) return
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveSettings(savePayload as StoredSettings)
          await SetLaunchOnWindowsStartup(launchOnWindowsStartup)
        } catch {
          // ignore persist errors
        }
      })()
    }, 450)
    return () => window.clearTimeout(timer)
  }, [canSave, savePayload])

  const handlePickImage = async (kind: 'background' | 'logo', setPath: (v: string) => void) => {
    if (!hasWailsApp()) return
    await yieldForNativeFileDialog()
    const picked = await PickImageFileWails()
    if (!picked) return
    try {
      const importedRelPath = await ImportSettingsImageWails(picked, kind)
      if (importedRelPath?.trim()) {
        setPath(importedRelPath.trim())
        return
      }
    } catch {
      // ignore and keep picked path as fallback
    }
    setPath(picked)
  }

  const handleClearBackground = () => setBackgroundImagePath('')
  const handleClearLogo = () => setLogoImagePath('')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Settings</title>
      </Head>

      <div className="min-h-0 flex-1 rounded-xl bg-theme-card">
        <div className="h-full overflow-auto rounded-lg border border-theme-border bg-theme-app p-6">
          <div className="mb-4">
            <div className="text-lg font-semibold text-theme-text">Settings</div>
            <div className="text-xs text-theme-muted">Configure launcher layout and visuals. Changes save automatically.</div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Shop Name</label>
              <Input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Enter shop name"
                className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Game Order</label>
              <Select value={gameOrder} onValueChange={(v) => setGameOrder(v as 'A-Z' | 'Z-A')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select game order" />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value="A-Z">A-Z</SelectItem>
                  <SelectItem value="Z-A">Z-A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-h-0 flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div className="text-sm text-theme-muted">Launch on Windows startup</div>
              <div className="flex flex-col items-center gap-1 sm:items-end">
                <Switch
                  checked={launchOnWindowsStartup}
                  onCheckedChange={setLaunchOnWindowsStartup}
                  disabled={!canSave}
                />
                <span className="text-center text-xs text-theme-muted sm:text-right">
                  Adds game-client.exe (same folder as Game Manager) to Windows startup. The switch reloads from HKCU\…\Run (EZJRGameClient).
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">When Launching Game</label>
              <Select
                value={whenLaunchingGame}
                onValueChange={(v) => setWhenLaunchingGame(v as 'minimized' | 'normal' | 'exit')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select behavior" />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="minimized">Minimized</SelectItem>
                  <SelectItem value="exit">Exit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Game Icon Size</label>
              <Select value={gameIconSize} onValueChange={(v) => setGameIconSize(v as 'small' | 'medium' | 'large')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select icon size" />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm text-theme-muted">Category Position</label>
                <div className="flex items-center space-x-1.5">
                  <Switch checked={showCategoryIcons} onCheckedChange={setShowCategoryIcons} id="show-category-icons" />
                  <label htmlFor="show-category-icons" className="text-sm text-theme-muted">
                    Show category icons
                  </label>
                </div>
              </div>
              <EdgeAlignSelect
                idPrefix="category-pos"
                value={categoryPosition}
                onChange={setCategoryPosition}
              />
              <p className="text-xs leading-relaxed text-theme-muted">
                Top/Bottom: <span className="text-theme-text/90">Left / Center / Right</span> aligns the horizontal tab strip;{' '}
                <span className="text-theme-text/90">Right</span> lists categories from right to left (ALL stays at the screen edge). Left/Right rails:{' '}
                <span className="text-theme-text/90">Upper / Center / Lower</span> along the side. When tabs don&apos;t fit, the client shows a More menu.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
                <label className="text-sm text-theme-muted">Quick Access Position</label>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                  <div className="flex items-center space-x-1.5">
                    <label className="text-sm text-theme-muted">Show Quick Access</label>
                    <Switch checked={showQuickAccess} onCheckedChange={setShowQuickAccess} />
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <label className="text-sm text-theme-muted">Show Title</label>
                    <Switch checked={showQuickAccessTitle} onCheckedChange={setShowQuickAccessTitle} disabled={!showQuickAccess} />
                  </div>
                </div>
              </div>
              <EdgeAlignSelect
                idPrefix="quick-pos"
                value={quickAccessPosition}
                onChange={setQuickAccessPosition}
                disabled={!showQuickAccess}
              />
            </div>

            <div className={cn("space-y-3 rounded-lg border border-theme-border bg-theme-card/40 p-4",
              !showQuickAccess ? 'opacity-50 cursor-not-allowed' : '',
            )}>
              <div>
                <div className="text-sm font-medium text-theme-text">Quick Access shortcuts</div>
                <p className="mt-0.5 text-xs text-theme-muted">
                  Pin and reorder games shown in the client launcher quick access strip.
                </p>
              </div>
              <QuickAccessEditor embedded disabled={!showQuickAccess} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-theme-muted">Running Text</label>
                <div className="flex items-center space-x-1.5">
                  <label className="text-sm text-theme-muted">Show Footer</label>
                  <Switch checked={showFooter} onCheckedChange={setShowFooter} />
                </div>
              </div>
              <Input
                value={runningText}
                onChange={(e) => setRunningText(e.target.value)}
                placeholder="Text shown for running label"
                className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
              />
            </div>

            <div className="space-y-1.5">
              <div className='flex items-center justify-between'>
                <label className="text-sm text-theme-muted">Tags Position</label>
                <div className="flex items-center space-x-1.5">
                  <label className="text-sm text-theme-muted">Show Tags</label>
                  <div className="flex items-center">
                    <Switch checked={showTags} onCheckedChange={setShowTags} />
                  </div>
                </div>
              </div>
              <EdgeAlignSelect
                idPrefix="tags-pos"
                value={tagsPosition}
                onChange={setTagsPosition}
                disabled={!showTags}
              />
            </div>

            <div className="space-y-2 pt-2">
              <div className="text-xs text-theme-muted">
                Background images are optional. If missing, the launcher will fall back to the theme dark color.
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-theme-muted">Background Image</label>
                <div className='flex items-center space-x-1.5'>
                  {backgroundImagePath
                    ? <div className='bg-theme-sidebar w-full rounded-md p-1.5 px-3 border-theme-border border text-sm text-slate-500'>{backgroundImagePath}</div>
                    : <Input value={backgroundImagePath} disabled placeholder="No image selected" className="bg-theme-sidebar" />
                  }
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                      onClick={() => void handlePickImage('background', setBackgroundImagePath)}
                      disabled={!canSave}
                    >
                      Browse
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                      onClick={handleClearBackground}
                      disabled={!canSave}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-theme-muted">Logo Image</label>
                <div className='flex items-center space-x-1.5'>
                  {logoImagePath
                    ? <div className='bg-theme-sidebar w-full rounded-md p-1.5 px-3 border-theme-border border text-sm text-slate-500'>{logoImagePath}</div>
                    : <Input value={logoImagePath} disabled placeholder="No image selected" className="bg-theme-sidebar" />
                  }
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                      onClick={() => void handlePickImage('logo', setLogoImagePath)}
                      disabled={!canSave}
                    >
                      Browse
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                      onClick={handleClearLogo}
                      disabled={!canSave}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

