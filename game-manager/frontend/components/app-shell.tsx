import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'
import { loadSettings, saveSettings, type ThemeAppearance as StoredAppearance } from '@/lib/settings-storage'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Gamepad2,
  Layers,
  Link2,
  Moon,
  Settings,
  Sun,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { href: '/games', label: 'Games', icon: Gamepad2 },
  { href: '/categories', label: 'Categories', icon: Layers },
  { href: '/tags', label: 'Tags', icon: Tags },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/links', label: 'Links', icon: Link2 },
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
      appBackground: '#F0F2F5',
      sidebar: '#FAFBFC',
      card: '#FFFFFF',
      border: '#C4CDD6',
      text: '#0D1117',
      mutedText: '#4C5768',
      secondaryText: '#444D5A',
      primary: '#0969DA',
      hover: '#0550AE',
      secondary: '#E8EEF5',
      secondaryHover: '#D8E4F0',
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
      appBackground: '#EDF2F1',
      sidebar: '#F7FBFA',
      card: '#FFFFFF',
      border: '#A8BDB8',
      text: '#0D1B18',
      mutedText: '#3D524E',
      secondaryText: '#2F4540',
      primary: '#0F766E',
      hover: '#0D5C56',
      secondary: '#DCEAE7',
      secondaryHover: '#C8DCD6',
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
      appBackground: '#F2F0FA',
      sidebar: '#FBFAFF',
      card: '#FFFFFF',
      border: '#B8B3D0',
      text: '#14121F',
      mutedText: '#4A4558',
      secondaryText: '#3D3849',
      primary: '#6D28D9',
      hover: '#5B21B6',
      secondary: '#E8E2F7',
      secondaryHover: '#D8CFF0',
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
      appBackground: '#EDE8DE',
      sidebar: '#F5F0E6',
      card: '#FFFDF8',
      border: '#B0A896',
      text: '#252820',
      mutedText: '#4F4A3F',
      secondaryText: '#454038',
      primary: '#C4154B',
      hover: '#A91242',
      secondary: '#E0DACE',
      secondaryHover: '#D0C9BA',
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
      appBackground: '#EEEBE6',
      sidebar: '#F6F3EE',
      card: '#FFFCF9',
      border: '#B5AFA7',
      text: '#1F1C19',
      mutedText: '#4F4A45',
      secondaryText: '#423D39',
      primary: '#6B5BC9',
      hover: '#5849B0',
      secondary: '#E2DDD6',
      secondaryHover: '#D2CCC3',
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
      appBackground: '#E8EAEF',
      sidebar: '#F2F4F8',
      card: '#FFFFFF',
      border: '#A8AFBC',
      text: '#161820',
      mutedText: '#454A54',
      secondaryText: '#3A3F48',
      primary: '#D97706',
      hover: '#B45309',
      secondary: '#D8DEE8',
      secondaryHover: '#C8CFDC',
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
      appBackground: '#F2E6C3',
      sidebar: '#FAF0D2',
      card: '#FFF9E6',
      border: '#C4B28C',
      text: '#282421',
      mutedText: '#504945',
      secondaryText: '#443E3A',
      primary: '#B57614',
      hover: '#9D6308',
      secondary: '#E5D9B4',
      secondaryHover: '#D5C9A0',
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
      appBackground: '#EEEEF5',
      sidebar: '#F6F6FC',
      card: '#FFFFFF',
      border: '#B4B4CC',
      text: '#1E2130',
      mutedText: '#4A4F63',
      secondaryText: '#3D4255',
      primary: '#7C5ECF',
      hover: '#6B4BC4',
      secondary: '#DCDCF0',
      secondaryHover: '#CCCCDE',
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
      appBackground: '#E2E6ED',
      sidebar: '#EEF1F6',
      card: '#FFFFFF',
      border: '#B8C0D0',
      text: '#1C2430',
      mutedText: '#3D4759',
      secondaryText: '#343E4E',
      primary: '#5E81AC',
      hover: '#4C6F99',
      secondary: '#D0D8E6',
      secondaryHover: '#BFC8D8',
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
    <div className="flex h-screen w-screen overflow-hidden bg-theme-app text-theme-text">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-theme-border bg-theme-sidebar shadow-[inset_-1px_0_0_rgba(0,0,0,0.04)]">
        <div className="wails-drag border-b border-theme-border px-3 py-3">
          <div className="font-display text-[15px] font-semibold leading-tight tracking-tight text-theme-text">
            Game Manager
          </div>
          <div className="mt-0.5 text-xs text-theme-muted">Library &amp; settings</div>
        </div>

        <nav className="wails-no-drag flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Primary">
          {navItems.map((item) => {
            const active = activePath === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-theme-secondary-hover font-medium text-theme-text'
                    : 'text-theme-muted hover:bg-theme-secondary hover:text-theme-text',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="wails-no-drag space-y-2 border-t border-theme-border p-2">
          <div className="px-1">
            <label htmlFor="theme-picker" className="mb-1 block text-xs font-medium text-theme-muted">
              Theme
            </label>
            <Select value={familyId} onValueChange={onFamilyChange}>
              <SelectTrigger id="theme-picker" className="h-9 w-full" aria-label="Theme">
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
          </div>
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
                'h-8 flex-1 rounded px-2 text-xs text-theme-text hover:bg-theme-secondary-hover',
                appearance === 'dark' && 'bg-theme-primary text-white hover:bg-theme-primary-hover',
              )}
            >
              <Moon className="mx-auto h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={appearance === 'light'}
              onClick={() => appearance !== 'light' && applyAndSave(familyId, 'light')}
              className={cn(
                'h-8 flex-1 rounded px-2 text-xs text-theme-text hover:bg-theme-secondary-hover',
                appearance === 'light' && 'bg-theme-primary text-white hover:bg-theme-primary-hover',
              )}
            >
              <Sun className="mx-auto h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="wails-no-drag min-h-0 min-w-0 flex-1 overflow-auto p-4">{children}</main>
    </div>
  )
}
