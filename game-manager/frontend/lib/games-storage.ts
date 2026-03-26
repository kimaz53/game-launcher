import type { Game } from '@/lib/game'
import { normalizeGame } from '@/lib/game'

/** True when the app is running inside Wails (Go bindings on `window.go`). */
export function hasWailsApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { go?: { main?: { App?: unknown } } }).go?.main?.App)
  )
}

async function loadFromWails(): Promise<Game[]> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadGamesJSON()
  const parsed = JSON.parse(json) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.map((row) => normalizeGame(row as Record<string, unknown>))
}

async function saveToWails(games: Game[]): Promise<void> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const payload = JSON.stringify(games, null, 2)
  await mod.SaveGamesJSON(payload)
}

export async function loadGames(): Promise<Game[]> {
  try {
    if (hasWailsApp()) return await loadFromWails()
  } catch {}

  return []
}

export async function saveGames(games: Game[]): Promise<void> {
  try {
    if (hasWailsApp()) await saveToWails(games)
  } catch {}
}
