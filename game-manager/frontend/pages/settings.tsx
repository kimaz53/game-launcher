import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { saveSettings, loadSettings, type Settings as StoredSettings } from '@/lib/settings-storage'
import { hasWailsApp } from '@/lib/games-storage'
import { yieldForNativeFileDialog } from '@/lib/yield-for-native-file-dialog'
import { ImportSettingsImage as ImportSettingsImageWails, PickImageFile as PickImageFileWails } from '@/wailsjs/wailsjs/go/main/App'

export default function SettingsPage() {
  const [hydrated, setHydrated] = useState(false)
  const [working, setWorking] = useState(false)

  const [shopName, setShopName] = useState('')
  const [gameOrder, setGameOrder] = useState<'A-Z' | 'Z-A'>('A-Z')
  const [whenLaunchingGame, setWhenLaunchingGame] = useState<'minimized' | 'normal' | 'exit'>('normal')
  const [gameIconSize, setGameIconSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [categoryPosition, setCategoryPosition] = useState<'top-left' | 'top-center' | 'top-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right'
    | 'center-left' | 'center-right'>('top-left')
  const [quickAccessPosition, setQuickAccessPosition] = useState<'top-left' | 'top-center' | 'top-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right'
    | 'center-left' | 'center-right'>('center-right')
  const [tagsPosition, setTagsPosition] = useState<'top-left' | 'top-center' | 'top-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right'
    | 'center-left' | 'center-right'>('top-left')
  const [showTags, setShowTags] = useState(true)
  const [showQuickAccess, setShowQuickAccess] = useState(true)
  const [runningText, setRunningText] = useState('')

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
        if (rawLaunch === 'minimized' || rawLaunch === 'normal') setWhenLaunchingGame(rawLaunch)

        const rawIconSize = (stored as Record<string, unknown>).gameIconSize
        if (rawIconSize === 'small' || rawIconSize === 'medium' || rawIconSize === 'large') setGameIconSize(rawIconSize)

        const rawCategoryPos = (stored as Record<string, unknown>).categoryPosition
        if (rawCategoryPos === 'top-left' || rawCategoryPos === 'top-center' || rawCategoryPos === 'top-right'
          || rawCategoryPos === 'bottom-left' || rawCategoryPos === 'bottom-center' || rawCategoryPos === 'bottom-right'
          || rawCategoryPos === 'center-left' || rawCategoryPos === 'center-right') setCategoryPosition(rawCategoryPos)

        const rawQuickPos = (stored as Record<string, unknown>).quickAccessPosition
        if (rawQuickPos === 'center-left' || rawQuickPos === 'center-right') setQuickAccessPosition(rawQuickPos)

        const rawTagsPos = (stored as Record<string, unknown>).tagsPosition
        if (rawTagsPos === 'top-left' || rawTagsPos === 'top-center' || rawTagsPos === 'top-right'
          || rawTagsPos === 'bottom-left' || rawTagsPos === 'bottom-center' || rawTagsPos === 'bottom-right'
          || rawTagsPos === 'center-left' || rawTagsPos === 'center-right') setTagsPosition(rawTagsPos)

        const rawShowTags = (stored as Record<string, unknown>).showTags
        if (typeof rawShowTags === 'boolean') setShowTags(rawShowTags)

        const rawShowQuickAccess = (stored as Record<string, unknown>).showQuickAccess
        if (typeof rawShowQuickAccess === 'boolean') setShowQuickAccess(rawShowQuickAccess)

        const rawRunningText = (stored as Record<string, unknown>).runningText
        if (typeof rawRunningText === 'string') setRunningText(rawRunningText)

        const rawBg = (stored as Record<string, unknown>).backgroundImage
        if (typeof rawBg === 'string') setBackgroundImagePath(rawBg)

        const rawLogo = (stored as Record<string, unknown>).logoImage
        if (typeof rawLogo === 'string') setLogoImagePath(rawLogo)
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
      quickAccessPosition,
      tagsPosition,
      showTags,
      showQuickAccess,
      runningText,
      backgroundImage: backgroundImagePath || undefined,
      logoImage: logoImagePath || undefined,
    }),
    [
      shopName,
      gameOrder,
      whenLaunchingGame,
      gameIconSize,
      categoryPosition,
      quickAccessPosition,
      tagsPosition,
      showTags,
      showQuickAccess,
      runningText,
      backgroundImagePath,
      logoImagePath,
    ]
  )

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

  const handleSave = async () => {
    if (!canSave) return
    setWorking(true)
    try {
      // Persist to the app portable data dir (os.Executable()/data/settings.json).
      // When running from `build/bin`, this maps to `build/bin/data/settings.json`.
      await saveSettings(savePayload as StoredSettings)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Settings</title>
      </Head>

      <div className="min-h-0 flex-1 rounded-xl bg-theme-card">
        <div className="h-full overflow-auto rounded-lg border border-theme-border bg-theme-app p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-lg font-semibold text-theme-text">Settings</div>
              <div className="text-xs text-theme-muted">Configure launcher layout and visuals.</div>
            </div>
            <Button
              type="button"
              className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
              onClick={() => void handleSave()}
              disabled={!canSave || working}
            >
              {working ? 'Saving…' : 'Save'}
            </Button>
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
              <label className="text-sm text-theme-muted">Category Position</label>
              <Select value={categoryPosition} onValueChange={(v) => setCategoryPosition(v as | 'top-left' | 'top-center' | 'top-right'
                | 'bottom-left' | 'bottom-center' | 'bottom-right'
                | 'center-left' | 'center-right'
              )}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category position" />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-center">Top Center</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-center">Bottom Center</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  <SelectItem value="center-left">Center Left</SelectItem>
                  <SelectItem value="center-right">Center Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className='flex items-center justify-between'>
                <label className="text-sm text-theme-muted">Quick Access Position</label>
                <div className="flex items-center space-x-1.5">
                  <label className="text-sm text-theme-muted">Show Quick Access</label>
                  <div className="flex items-center">
                    <Switch checked={showQuickAccess} onCheckedChange={setShowQuickAccess} />
                  </div>
                </div>
              </div>
              <Select
                value={quickAccessPosition}
                onValueChange={(v) => setQuickAccessPosition(v as | 'top-left' | 'top-center' | 'top-right'
                  | 'bottom-left' | 'bottom-center' | 'bottom-right'
                  | 'center-left' | 'center-right')}
                disabled={!showQuickAccess}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select quick access position" />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-center">Top Center</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-center">Bottom Center</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  <SelectItem value="center-left">Center Left</SelectItem>
                  <SelectItem value="center-right">Center Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Running Text</label>
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
              <Select value={tagsPosition} onValueChange={(v) => setTagsPosition(v as | 'top-left' | 'top-center' | 'top-right'
                | 'bottom-left' | 'bottom-center' | 'bottom-right'
                | 'center-left' | 'center-right'
              )}
                disabled={!showTags}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tags position" />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-center">Top Center</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-center">Bottom Center</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  <SelectItem value="center-left">Center Left</SelectItem>
                  <SelectItem value="center-right">Center Right</SelectItem>
                </SelectContent>
              </Select>
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
                  <Input value={logoImagePath} disabled placeholder="No image selected" className="bg-theme-sidebar" />
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

