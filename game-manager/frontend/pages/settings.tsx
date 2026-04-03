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
  PickPopularJsonFile as PickPopularJsonFileWails,
  SetLaunchOnWindowsStartup,
} from '@/wailsjs/wailsjs/go/main/App'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const [hydrated, setHydrated] = useState(false)

  const [shopName, setShopName] = useState('')
  const [gameOrder, setGameOrder] = useState<'A-Z' | 'Z-A'>('A-Z')
  const [whenLaunchingGame, setWhenLaunchingGame] = useState<'minimized' | 'normal' | 'exit'>('normal')
  const [gameIconSize, setGameIconSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [showCategoryIcons, setShowCategoryIcons] = useState(true)
  const [showTags, setShowTags] = useState(true)
  const [showQuickAccess, setShowQuickAccess] = useState(true)
  const [showQuickAccessTitle, setShowQuickAccessTitle] = useState(true)
  const [showPopularStrip, setShowPopularStrip] = useState(true)
  const [popularDataPath, setPopularDataPath] = useState('')
  const [showGameDetailsSidebar, setShowGameDetailsSidebar] = useState(true)
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

        const rawShowCategoryIcons = (stored as Record<string, unknown>).showCategoryIcons
        if (typeof rawShowCategoryIcons === 'boolean') setShowCategoryIcons(rawShowCategoryIcons)

        const rawShowPopular = (stored as Record<string, unknown>).showPopularStrip
        if (typeof rawShowPopular === 'boolean') setShowPopularStrip(rawShowPopular)

        const rawPopularPath = (stored as Record<string, unknown>).popularDataPath
        if (typeof rawPopularPath === 'string') setPopularDataPath(rawPopularPath)

        const rawShowTags = (stored as Record<string, unknown>).showTags
        if (typeof rawShowTags === 'boolean') setShowTags(rawShowTags)

        const rawShowQuickAccess = (stored as Record<string, unknown>).showQuickAccess
        if (typeof rawShowQuickAccess === 'boolean') setShowQuickAccess(rawShowQuickAccess)

        const rawShowQuickAccessTitle = (stored as Record<string, unknown>).showQuickAccessTitle
        if (typeof rawShowQuickAccessTitle === 'boolean') setShowQuickAccessTitle(rawShowQuickAccessTitle)

        const rawShowGameDetails = (stored as Record<string, unknown>).showGameDetailsSidebar
        if (typeof rawShowGameDetails === 'boolean') setShowGameDetailsSidebar(rawShowGameDetails)

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
      showCategoryIcons,
      showPopularStrip,
      popularDataPath: popularDataPath.trim() || undefined,
      showTags,
      showQuickAccess,
      showQuickAccessTitle,
      showGameDetailsSidebar,
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
      showCategoryIcons,
      showPopularStrip,
      popularDataPath,
      showTags,
      showQuickAccess,
      showQuickAccessTitle,
      showGameDetailsSidebar,
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

  const handlePickPopularJson = async () => {
    if (!hasWailsApp()) return
    await yieldForNativeFileDialog()
    const picked = await PickPopularJsonFileWails()
    if (picked?.trim()) setPopularDataPath(picked.trim())
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Settings</title>
      </Head>

      <div className="min-h-0 flex-1 rounded-xl bg-theme-card">
        <div className="h-full overflow-auto rounded-lg border border-theme-border bg-theme-app p-6">
          <div className="mb-4">
            <div className="text-lg font-semibold text-theme-text">Settings</div>
            <div className="text-xs text-theme-muted">
              Layout matches the game client shell: header, sidebar (categories + quick access), main grid, footer.
              Changes save automatically.
            </div>
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

            <div className="space-y-3 rounded-lg border border-theme-border bg-theme-card/40 p-4">
              <div className="text-sm font-medium text-theme-text">Sidebar &amp; main</div>
              <p className="text-xs text-theme-muted">
                Categories and quick access live in the left sidebar on the game client. Use the toggles below; there are no edge/corner
                positions anymore.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="show-category-icons" className="text-sm text-theme-muted">
                  Show category icons
                </label>
                <Switch checked={showCategoryIcons} onCheckedChange={setShowCategoryIcons} id="show-category-icons" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="show-popular" className="text-sm text-theme-muted">
                  Show &quot;Popular&quot; strip
                </label>
                <Switch checked={showPopularStrip} onCheckedChange={setShowPopularStrip} id="show-popular" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-theme-muted">Show quick access</span>
                <Switch checked={showQuickAccess} onCheckedChange={setShowQuickAccess} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-theme-muted">Show quick access title</span>
                <Switch
                  checked={showQuickAccessTitle}
                  onCheckedChange={setShowQuickAccessTitle}
                  disabled={!showQuickAccess}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-theme-muted">Show tags on tiles</span>
                <Switch checked={showTags} onCheckedChange={setShowTags} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-theme-muted">Show game details sidebar (IGDB / simple)</span>
                <Switch checked={showGameDetailsSidebar} onCheckedChange={setShowGameDetailsSidebar} />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-theme-border bg-theme-card/40 p-4">
              <div className="text-sm font-medium text-theme-text">Popular list file (diskless / network)</div>
              <p className="text-xs leading-relaxed text-theme-muted">
                Optional absolute path to <span className="font-mono text-theme-text/90">popular.json</span>, or a folder that contains it
                (e.g.{' '}
                <span className="font-mono text-theme-text/90">
                  {'\\\\fileserver\\share\\launcher\\popular.json'}
                </span>
                ). Empty = use{' '}
                <span className="font-mono text-theme-text/90">data/popular.json</span> next to the apps. Format:{' '}
                <span className="font-mono text-theme-text/90">{`{ "gameIds": [1,2,3] }`}</span>. The client also writes{' '}
                <span className="font-mono text-theme-text/90">launch-stats.json</span> in the same folder (open counts per game id).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={popularDataPath}
                  onChange={(e) => setPopularDataPath(e.target.value)}
                  placeholder="Leave empty for default data/popular.json"
                  className="min-w-[12rem] flex-1 border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                  onClick={() => void handlePickPopularJson()}
                  disabled={!canSave}
                >
                  Browse…
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                  onClick={() => setPopularDataPath('')}
                  disabled={!canSave}
                >
                  Use default
                </Button>
              </div>
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

