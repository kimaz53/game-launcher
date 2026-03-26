import { hasWailsApp } from '@/lib/games-storage'

export type CategoryDefinition = {
  name: string
  iconRelPath?: string
  iconDataUrl?: string
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function parseCategoryDefinitions(parsed: unknown): CategoryDefinition[] {
  if (!Array.isArray(parsed)) return []

  // Legacy string[] support
  if (parsed.length > 0 && typeof parsed[0] === 'string') {
    return normalizeCategories((parsed as string[]).map((name) => ({ name })))
  }

  const defs: CategoryDefinition[] = []
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    defs.push({
      name: String(r.name ?? ''),
      iconRelPath: asString(r.iconRelPath) ?? undefined,
      iconDataUrl: asString(r.iconDataUrl) ?? undefined,
    })
  }
  return normalizeCategories(defs)
}

function normalizeCategories(defs: CategoryDefinition[]): CategoryDefinition[] {
  const seen = new Set<string>()
  const out: CategoryDefinition[] = []
  for (const d of defs) {
    const name = (d?.name ?? '').trim()
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    const iconRelPath = d.iconRelPath?.trim()
    const iconDataUrl = d.iconDataUrl?.trim()
    out.push({
      name,
      iconRelPath: iconRelPath ? iconRelPath : undefined,
      iconDataUrl: iconDataUrl ? iconDataUrl : undefined,
    })
  }
  return out
}

async function loadFromWails(): Promise<CategoryDefinition[]> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadCategoriesJSON()
  const parsed = JSON.parse(json) as unknown
  return parseCategoryDefinitions(parsed)
}

async function saveToWails(categories: CategoryDefinition[]): Promise<void> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  await mod.SaveCategoriesJSON(JSON.stringify(categories, null, 2))
}

export async function loadCategories(): Promise<CategoryDefinition[]> {
  try {
    // Don't rely solely on `hasWailsApp()`; the bridge may be ready slightly later.
    // Attempt Wails load first and only fall back if it throws.
    return await loadFromWails()
  } catch {
    return []
  }
}

export async function saveCategories(categories: CategoryDefinition[]): Promise<void> {
  const deduped = normalizeCategories(categories)

  try {
    // Attempt Wails save first; fall back to localStorage only if it fails.
    await saveToWails(deduped)
    return
  } catch {
    return
  }
}

