import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'
import { loadSettings, saveSettings, type ThemeAppearance as StoredAppearance } from '@/lib/settings-storage'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Moon, Sun } from 'lucide-react'

type NavItem = {
  href: string
  label: string
}

const navItems: NavItem[] = [
  { href: '/games', label: 'Games' },
  { href: '/categories', label: 'Categories' },
  { href: '/tags', label: 'Tags' },
  { href: '/clients', label: 'Clients' },
  { href: '/quick-access', label: 'Quick Access' },
  { href: '/settings', label: 'Settings' },
  { href: '/links', label: 'Links' },
]

type ThemeAppearance = 'dark' | 'light'

type ThemePalette = {
  appBackground: string
  sidebar: string
  card: string
  border: string
  text: string
  mutedText: string
  secondaryText: string
  primary: string
  hover: string
  secondary: string
  secondaryHover: string
  accent: string
  success: string
  warning: string
  error: string
  info: string
}

type ThemeFamily = {
  id: string
  label: string
  dark: ThemePalette
  light: ThemePalette
}

type ThemeSwatch = ThemePalette & {
  label: string
  appearance: ThemeAppearance
}

const darkSem = {
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#0EA5E9',
}

const lightSem = {
  success: '#15803D',
  warning: '#B45309',
  error: '#B91C1C',
  info: '#0369A1',
}

const themeFamilies: ThemeFamily[] = [
  {
    id: 'vs-blue',
    label: 'VS Blue',
    dark: {
      appBackground: '#0D1117',
      sidebar: '#161B22',
      card: '#1F2937',
      border: '#30363D',
      text: '#F0F6FC',
      mutedText: '#9BA7B4',
      secondaryText: '#8B949E',
      primary: '#3B82F6',
      hover: '#2563EB',
      secondary: '#1E293B',
      secondaryHover: '#334155',
      accent: '#0EA5E9',
      ...darkSem,
    },
    light: {
      appBackground: '#F6F8FA',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#D0D7DE',
      text: '#1F2328',
      mutedText: '#656D76',
      secondaryText: '#57606A',
      primary: '#0969DA',
      hover: '#0550AE',
      secondary: '#EFF2F5',
      secondaryHover: '#D8DEE4',
      accent: '#0550AE',
      ...lightSem,
    },
  },
  {
    id: 'vs-teal',
    label: 'VS Teal',
    dark: {
      appBackground: '#0F1419',
      sidebar: '#172026',
      card: '#20303A',
      border: '#334853',
      text: '#ECF3F8',
      mutedText: '#93A6B3',
      secondaryText: '#7D8E9A',
      primary: '#14B8A6',
      hover: '#0D9488',
      secondary: '#1F2D36',
      secondaryHover: '#2D404E',
      accent: '#22D3EE',
      ...darkSem,
    },
    light: {
      appBackground: '#F3F8F7',
      sidebar: '#FAFDFC',
      card: '#FFFFFF',
      border: '#C5D5D2',
      text: '#152320',
      mutedText: '#5C6F6C',
      secondaryText: '#3D524E',
      primary: '#0F766E',
      hover: '#0D5C56',
      secondary: '#E6F4F2',
      secondaryHover: '#D0E8E4',
      accent: '#0E7490',
      ...lightSem,
    },
  },
  {
    id: 'vs-purple',
    label: 'VS Purple',
    dark: {
      appBackground: '#11111B',
      sidebar: '#1B1B2A',
      card: '#2A2A40',
      border: '#3E3E5A',
      text: '#F5F3FF',
      mutedText: '#A8A3C2',
      secondaryText: '#9B95B8',
      primary: '#8B5CF6',
      hover: '#7C3AED',
      secondary: '#25253A',
      secondaryHover: '#34344E',
      accent: '#A78BFA',
      ...darkSem,
    },
    light: {
      appBackground: '#FAFAFF',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#D4D2E8',
      text: '#1E1B2E',
      mutedText: '#6B6680',
      secondaryText: '#4A4558',
      primary: '#6D28D9',
      hover: '#5B21B6',
      secondary: '#F3F0FF',
      secondaryHover: '#E9E3FF',
      accent: '#5B21B6',
      ...lightSem,
    },
  },
  {
    id: 'monokai-classic',
    label: 'Monokai Classic',
    dark: {
      appBackground: '#272822',
      sidebar: '#2D2E27',
      card: '#3A3B36',
      border: '#5B5C57',
      text: '#F8F8F2',
      mutedText: '#A6A28C',
      secondaryText: '#989580',
      primary: '#F92672',
      hover: '#E91E63',
      secondary: '#3B3D37',
      secondaryHover: '#4A4C45',
      accent: '#66D9EF',
      ...darkSem,
    },
    light: {
      appBackground: '#F5F1E8',
      sidebar: '#EFE9DD',
      card: '#FFFCF5',
      border: '#C9C2B2',
      text: '#3A3D2E',
      mutedText: '#6B6658',
      secondaryText: '#525047',
      primary: '#C4154B',
      hover: '#A91242',
      secondary: '#E8E4D9',
      secondaryHover: '#D9D4C7',
      accent: '#0B7285',
      ...lightSem,
    },
  },
  {
    id: 'monokai-pro',
    label: 'Monokai Pro',
    dark: {
      appBackground: '#2D2A2E',
      sidebar: '#221F22',
      card: '#363337',
      border: '#5B595C',
      text: '#FCFCFA',
      mutedText: '#A9A7A9',
      secondaryText: '#9A9699',
      primary: '#AB9DF2',
      hover: '#9A8AE6',
      secondary: '#403E41',
      secondaryHover: '#4D4A4E',
      accent: '#78DCE8',
      ...darkSem,
    },
    light: {
      appBackground: '#F7F5F2',
      sidebar: '#EFEBE7',
      card: '#FFFBF8',
      border: '#CBC6C0',
      text: '#2E2B28',
      mutedText: '#6F6A66',
      secondaryText: '#4F4A47',
      primary: '#6B5BC9',
      hover: '#5849B0',
      secondary: '#ECE8E3',
      secondaryHover: '#DED9D2',
      accent: '#1E8A99',
      ...lightSem,
    },
  },
  {
    id: 'monokai-octagon',
    label: 'Monokai Octagon',
    dark: {
      appBackground: '#282A36',
      sidebar: '#21222C',
      card: '#303241',
      border: '#44475A',
      text: '#F8F8F2',
      mutedText: '#A4A7B4',
      secondaryText: '#9497A3',
      primary: '#FFB86C',
      hover: '#FFA94D',
      secondary: '#3A3D4D',
      secondaryHover: '#4A4E60',
      accent: '#8BE9FD',
      ...darkSem,
    },
    light: {
      appBackground: '#F0F2F5',
      sidebar: '#E8EAEF',
      card: '#FFFFFF',
      border: '#C5CAD5',
      text: '#282A33',
      mutedText: '#5E6470',
      secondaryText: '#454A54',
      primary: '#D97706',
      hover: '#B45309',
      secondary: '#E4E7EE',
      secondaryHover: '#D3D8E3',
      accent: '#0284C7',
      ...lightSem,
    },
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    dark: {
      appBackground: '#282828',
      sidebar: '#1D2021',
      card: '#32302F',
      border: '#504945',
      text: '#EBDBB2',
      mutedText: '#BDAE93',
      secondaryText: '#A89984',
      primary: '#D79921',
      hover: '#B57614',
      secondary: '#3C3836',
      secondaryHover: '#504945',
      accent: '#83A598',
      ...darkSem,
    },
    light: {
      appBackground: '#FBF1C7',
      sidebar: '#F2E5BC',
      card: '#F9F5D7',
      border: '#D5C4A1',
      text: '#3C3836',
      mutedText: '#665C54',
      secondaryText: '#504945',
      primary: '#B57614',
      hover: '#9D6308',
      secondary: '#EBDBB2',
      secondaryHover: '#D5C4A1',
      accent: '#427B58',
      ...lightSem,
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    dark: {
      appBackground: '#282A36',
      sidebar: '#21222C',
      card: '#303447',
      border: '#44475A',
      text: '#F8F8F2',
      mutedText: '#B6B9C8',
      secondaryText: '#A2A5B4',
      primary: '#BD93F9',
      hover: '#A67DE8',
      secondary: '#343746',
      secondaryHover: '#44475A',
      accent: '#8BE9FD',
      ...darkSem,
    },
    light: {
      appBackground: '#F7F7FA',
      sidebar: '#EFEFF5',
      card: '#FFFFFF',
      border: '#D1D1E0',
      text: '#343746',
      mutedText: '#62677E',
      secondaryText: '#4A4F63',
      primary: '#7C5ECF',
      hover: '#6B4BC4',
      secondary: '#E8E8F2',
      secondaryHover: '#D8D8E8',
      accent: '#0891B2',
      ...lightSem,
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    dark: {
      appBackground: '#2E3440',
      sidebar: '#3B4252',
      card: '#434C5E',
      border: '#4C566A',
      text: '#ECEFF4',
      mutedText: '#D8DEE9',
      secondaryText: '#C8D0E0',
      primary: '#5E81AC',
      hover: '#4C6F99',
      secondary: '#3B4252',
      secondaryHover: '#4C566A',
      accent: '#88C0D0',
      ...darkSem,
    },
    light: {
      appBackground: '#ECEFF4',
      sidebar: '#E5E9F0',
      card: '#FFFFFF',
      border: '#D8DEE9',
      text: '#2E3440',
      mutedText: '#4C566A',
      secondaryText: '#434C5E',
      primary: '#5E81AC',
      hover: '#4C6F99',
      secondary: '#D8DEE9',
      secondaryHover: '#C8D0E0',
      accent: '#8FBCBB',
      ...lightSem,
    },
  },
]

/** Migrate saved labels from the old combined light/dark dropdown. */
const LEGACY_THEME_LABELS: Record<string, { familyId: string; appearance: ThemeAppearance }> = {
  'VS Dark Blue': { familyId: 'vs-blue', appearance: 'dark' },
  'VS Light Blue': { familyId: 'vs-blue', appearance: 'light' },
  'VS Dark Teal': { familyId: 'vs-teal', appearance: 'dark' },
  'VS Light Teal': { familyId: 'vs-teal', appearance: 'light' },
  'VS Dark Purple': { familyId: 'vs-purple', appearance: 'dark' },
  'VS Light Purple': { familyId: 'vs-purple', appearance: 'light' },
  'Monokai Classic': { familyId: 'monokai-classic', appearance: 'dark' },
  'Monokai Classic Light': { familyId: 'monokai-classic', appearance: 'light' },
  'Monokai Pro': { familyId: 'monokai-pro', appearance: 'dark' },
  'Monokai Pro Light': { familyId: 'monokai-pro', appearance: 'light' },
  'Monokai Octagon': { familyId: 'monokai-octagon', appearance: 'dark' },
  'Monokai Octagon Light': { familyId: 'monokai-octagon', appearance: 'light' },
  'Gruvbox Dark': { familyId: 'gruvbox', appearance: 'dark' },
  'Gruvbox Light': { familyId: 'gruvbox', appearance: 'light' },
  Dracula: { familyId: 'dracula', appearance: 'dark' },
  'Dracula Light': { familyId: 'dracula', appearance: 'light' },
  Nord: { familyId: 'nord', appearance: 'dark' },
  'Nord Snow': { familyId: 'nord', appearance: 'light' },
}

const STORAGE_FAMILY = 'ui-theme-family'
const STORAGE_APPEARANCE = 'ui-theme-appearance'
const LEGACY_STORAGE = 'ui-theme-accent'

function familyById(id: string): ThemeFamily {
  return themeFamilies.find((f) => f.id === id) ?? themeFamilies[0]
}

function swatchFor(familyId: string, appearance: ThemeAppearance): ThemeSwatch {
  const family = familyById(familyId)
  const palette = appearance === 'dark' ? family.dark : family.light
  return {
    label: family.label,
    appearance,
    ...palette,
  }
}

function applyThemeSwatch(theme: ThemeSwatch) {
  const root = document.documentElement.style
  root.setProperty('--color-app-background', theme.appBackground)
  root.setProperty('--color-sidebar', theme.sidebar)
  root.setProperty('--color-card', theme.card)
  root.setProperty('--color-border', theme.border)
  root.setProperty('--color-text', theme.text)
  root.setProperty('--color-muted-text', theme.mutedText)
  root.setProperty('--color-secondary-text', theme.secondaryText)
  root.setProperty('--color-primary-button', theme.primary)
  root.setProperty('--color-hovered-primary-button', theme.hover)
  root.setProperty('--color-secondary-button', theme.secondary)
  root.setProperty('--color-hovered-secondary-button', theme.secondaryHover)
  root.setProperty('--color-secondary-accent', theme.accent)
  root.setProperty('--color-success', theme.success)
  root.setProperty('--color-warning', theme.warning)
  root.setProperty('--color-error', theme.error)
  root.setProperty('--color-info', theme.info)
  root.setProperty('--color-scrollbar-track', theme.sidebar)
  root.setProperty('--color-scrollbar-thumb', theme.border)
  root.setProperty('--color-scrollbar-thumb-hover', theme.secondaryHover)
}

type WailsRuntime = {
  WindowSetLightTheme?: () => void
  WindowSetDarkTheme?: () => void
}

function syncWailsWindowChrome(appearance: ThemeAppearance) {
  if (typeof window === 'undefined') return
  const rt = (window as unknown as { runtime?: WailsRuntime }).runtime
  if (!rt?.WindowSetLightTheme || !rt?.WindowSetDarkTheme) return
  if (appearance === 'light') {
    rt.WindowSetLightTheme()
  } else {
    rt.WindowSetDarkTheme()
  }
}

function sanitizeTheme(
  input: { familyId?: string; appearance?: ThemeAppearance } | null | undefined
): { familyId: string; appearance: ThemeAppearance } {
  const familyId =
    input?.familyId && themeFamilies.some((f) => f.id === input.familyId) ? input.familyId : themeFamilies[0].id
  const appearance: ThemeAppearance = input?.appearance === 'light' ? 'light' : 'dark'
  return { familyId, appearance }
}

function readLegacyThemeFromLocalStorage(): { familyId?: string; appearance?: ThemeAppearance } | null {
  if (typeof window === 'undefined') return null

  const familyId = window.localStorage.getItem(STORAGE_FAMILY)
  const appearanceRaw = window.localStorage.getItem(STORAGE_APPEARANCE)
  if (familyId && themeFamilies.some((f) => f.id === familyId)) {
    const appearance: ThemeAppearance = appearanceRaw === 'light' ? 'light' : 'dark'
    return { familyId, appearance }
  }

  const legacy = window.localStorage.getItem(LEGACY_STORAGE)
  if (legacy) {
    const mapped = LEGACY_THEME_LABELS[legacy]
    if (mapped && themeFamilies.some((f) => f.id === mapped.familyId)) {
      return { familyId: mapped.familyId, appearance: mapped.appearance }
    }
  }

  return null
}

function clearLegacyThemeLocalStorage() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_FAMILY)
    window.localStorage.removeItem(STORAGE_APPEARANCE)
    window.localStorage.removeItem(LEGACY_STORAGE)
  } catch {
    /* ignore */
  }
}

/** `index.tsx` re-exports the games page, so `/` shows Games but `pathname` stays `/`. */
function navActivePath(pathname: string): string {
  return pathname === '/' ? '/games' : pathname
}

export function AppShell({ children }: PropsWithChildren) {
  const router = useRouter()
  const activePath = navActivePath(router.pathname)
  const [familyId, setFamilyId] = useState<string>(themeFamilies[0].id)
  const [appearance, setAppearance] = useState<ThemeAppearance>('dark')

  useEffect(() => {
    let cancelled = false

    async function run() {
      // Load from settings.json (portable). If missing, try migrating legacy localStorage once.
      const stored = await loadSettings()
      const fromSettings = sanitizeTheme({
        familyId: stored.themeFamilyId,
        appearance: (stored.themeAppearance as StoredAppearance) ?? undefined,
      })

      const legacy = readLegacyThemeFromLocalStorage()
      const fromLegacy = sanitizeTheme(legacy ?? undefined)

      const effective =
        stored.themeFamilyId || stored.themeAppearance ? fromSettings : legacy ? fromLegacy : fromSettings

      if (cancelled) return
      setFamilyId(effective.familyId)
      setAppearance(effective.appearance)
      applyThemeSwatch(swatchFor(effective.familyId, effective.appearance))
      syncWailsWindowChrome(effective.appearance)

      // Persist migration (and remove local storage usage).
      if (legacy && (!stored.themeFamilyId || !stored.themeAppearance)) {
        await saveSettings({
          themeFamilyId: effective.familyId,
          themeAppearance: effective.appearance,
        })
      }
      if (legacy) clearLegacyThemeLocalStorage()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const applyAndSave = (nextFamilyId: string, nextAppearance: ThemeAppearance) => {
    setFamilyId(nextFamilyId)
    setAppearance(nextAppearance)
    const swatch = swatchFor(nextFamilyId, nextAppearance)
    applyThemeSwatch(swatch)
    syncWailsWindowChrome(nextAppearance)
    void saveSettings({ themeFamilyId: nextFamilyId, themeAppearance: nextAppearance })
  }

  const onFamilyChange = (nextId: string) => {
    applyAndSave(nextId, appearance)
  }

  return (
    <div className="wails-drag h-screen w-screen overflow-hidden bg-theme-app text-theme-text">
      <Card className="flex h-full w-full flex-col gap-4 rounded-none border-none bg-theme-sidebar p-4">
        <div className="wails-drag flex items-center gap-2">
          <nav className="wails-no-drag flex flex-wrap gap-2">
            {navItems.map((item) => {
              const active = activePath === item.href
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={active ? 'default' : 'secondary'}
                  className={cn(
                    'rounded-md',
                    active
                      ? 'bg-theme-primary text-theme-text hover:bg-theme-primary-hover'
                      : 'bg-theme-secondary text-theme-muted hover:bg-theme-secondary-hover'
                  )}
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              )
            })}
          </nav>
          <div className="wails-no-drag ml-auto flex items-center gap-2">
            <label htmlFor="theme-picker" className="text-sm text-theme-muted">
              Theme
            </label>
            <Select value={familyId} onValueChange={onFamilyChange}>
              <SelectTrigger className="h-8 min-w-36" aria-label="Theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent className="min-w-36">
                {themeFamilies.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div
              className="flex rounded-md border border-theme-border bg-theme-card p-0.5"
              role="group"
              aria-label="Color mode"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={appearance === 'dark'}
                onClick={() => appearance !== 'dark' && applyAndSave(familyId, 'dark')}
                className={cn(
                  'h-7 rounded px-2.5 text-xs text-theme-text hover:bg-theme-secondary-hover',
                  appearance === 'dark' && 'bg-theme-primary hover:bg-theme-primary-hover'
                )}
              >
                <Moon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={appearance === 'light'}
                onClick={() => appearance !== 'light' && applyAndSave(familyId, 'light')}
                className={cn(
                  'h-7 rounded px-2.5 text-xs text-theme-text hover:bg-theme-secondary-hover',
                  appearance === 'light' && 'bg-theme-primary hover:bg-theme-primary-hover'
                )}
              >
                <Sun className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="wails-no-drag min-h-0 flex-1">
          {children}
        </div>
      </Card>
    </div>
  )
}
