import { hasWailsApp } from '@/lib/games-storage'

export type ThemeAppearance = 'dark' | 'light'

export type Settings = {
  themeFamilyId?: string
  themeAppearance?: ThemeAppearance
}

function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const themeFamilyId = typeof obj.themeFamilyId === 'string' ? obj.themeFamilyId : undefined
  const appearanceRaw = obj.themeAppearance
  const themeAppearance: ThemeAppearance | undefined =
    appearanceRaw === 'light' ? 'light' : appearanceRaw === 'dark' ? 'dark' : undefined
  return {
    themeFamilyId,
    themeAppearance,
  }
}

async function loadFromWails(): Promise<Settings> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadSettingsJSON()
  return normalizeSettings(JSON.parse(json) as unknown)
}

async function saveToWails(settings: Settings): Promise<void> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  await mod.SaveSettingsJSON(JSON.stringify(settings, null, 2))
}

export async function loadSettings(): Promise<Settings> {
  if (!hasWailsApp()) return {}
  try {
    return await loadFromWails()
  } catch {
    return {}
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  if (!hasWailsApp()) return
  try {
    // Merge so saving one field (e.g. theme) doesn't wipe others (e.g. clients).
    const current = await loadFromWails()
    await saveToWails({ ...current, ...next })
  } catch {
    // ignore
  }
}

