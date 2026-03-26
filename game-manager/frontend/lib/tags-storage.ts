import { hasWailsApp } from '@/lib/games-storage'

async function loadFromWails(): Promise<string[]> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadTagsJSON()
  const parsed = JSON.parse(json) as unknown
  return Array.isArray(parsed) ? parsed.map(String) : []
}

async function saveToWails(tags: string[]): Promise<void> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  await mod.SaveTagsJSON(JSON.stringify(tags, null, 2))
}

export async function loadTags(): Promise<string[]> {
  try {
    if (hasWailsApp()) {
      return await loadFromWails()
    }
  } catch {
    return []
  }
  return []
}

export async function saveTags(tags: string[]): Promise<void> {
  const deduped = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)))

  try {
    if (hasWailsApp()) {
      await saveToWails(deduped)
      return
    }
  } catch {
    return
  }
}

