import { hasWailsApp } from '@/lib/games-storage'

export type QuickAccessItemId = number

const STORAGE_KEY_FALLBACK = 'quick-access'

function normalizeQuickAccessIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []

  const out: number[] = []
  const seen = new Set<number>()

  for (const v of raw) {
    const id =
      typeof v === 'number'
        ? v
        : typeof v === 'string'
          ? Number(v)
          : NaN

    if (!Number.isFinite(id) || id <= 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

async function loadFromWailsQuickAccessJson(): Promise<number[]> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadQuickAccessJSON()
  const parsed = JSON.parse(json) as unknown
  return normalizeQuickAccessIds(parsed)
}

async function loadFromWailsSettingsLegacy(): Promise<number[]> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadSettingsJSON()
  const parsed = JSON.parse(json) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const rec = parsed as Record<string, unknown>
  const raw = rec.quickAccess ?? rec.quick_access ?? rec.quickaccess ?? rec.quickAccessIds ?? rec.quick_access_ids
  return normalizeQuickAccessIds(raw)
}

async function saveToWailsQuickAccessJson(ids: number[]): Promise<void> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  await mod.SaveQuickAccessJSON(JSON.stringify(ids, null, 2))
}

function loadFromLocalStorage(): number[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(STORAGE_KEY_FALLBACK)
  if (!raw) return []
  try {
    return normalizeQuickAccessIds(JSON.parse(raw))
  } catch {
    return []
  }
}

function saveToLocalStorage(ids: number[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY_FALLBACK, JSON.stringify(ids, null, 2))
}

export async function loadQuickAccessIds(): Promise<number[]> {
  try {
    if (hasWailsApp()) {
      // New storage: quick-access.json
      const stored = await loadFromWailsQuickAccessJson()
      if (stored.length > 0) return stored

      // Migration: settings.json -> quick-access.json (only when quick-access.json is empty).
      const legacy = await loadFromWailsSettingsLegacy()
      if (legacy.length > 0) {
        await saveToWailsQuickAccessJson(legacy)
        return legacy
      }

      return []
    }
  } catch {
    // ignore and fall back
  }
  return loadFromLocalStorage()
}

export async function saveQuickAccessIds(ids: number[]): Promise<void> {
  const normalized = normalizeQuickAccessIds(ids)

  try {
    if (hasWailsApp()) {
      await saveToWailsQuickAccessJson(normalized)
      return
    }
  } catch {
    // ignore and fall back
  }

  saveToLocalStorage(normalized)
}

