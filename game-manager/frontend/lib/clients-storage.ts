import { hasWailsApp } from '@/lib/games-storage'

export type ClientType = 'vip' | 'non-vip'

export type Client = {
  name: string
  ip: string
  type: ClientType
}

function normalizeClientType(raw: unknown): ClientType {
  return raw === 'vip' ? 'vip' : 'non-vip'
}

function normalizeClients(raw: unknown): Client[] {
  if (!Array.isArray(raw)) return []
  const out: Client[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const ip = typeof r.ip === 'string' ? r.ip.trim() : ''
    const type = normalizeClientType(r.type)
    if (!name || !ip) continue
    const key = ip.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, ip, type })
  }
  return out
}

async function loadFromWails(): Promise<Client[]> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  const json = await mod.LoadClientsJSON()
  return normalizeClients(JSON.parse(json) as unknown)
}

async function saveToWails(clients: Client[]): Promise<void> {
  const mod = await import('@/wailsjs/wailsjs/go/main/App')
  await mod.SaveClientsJSON(JSON.stringify(clients, null, 2))
}

export async function loadClients(): Promise<Client[]> {
  try {
    if (hasWailsApp()) return await loadFromWails()
  } catch {}
  return []
}

export async function saveClients(clients: Client[]): Promise<void> {
  const deduped = normalizeClients(clients)
  try {
    if (hasWailsApp()) await saveToWails(deduped)
  } catch {}
}

// One-time migration helper from old settings.clients storage.
export async function migrateClientsFromSettingsIfNeeded(): Promise<Client[]> {
  const existing = await loadClients()
  if (existing.length > 0) return existing

  let legacyRaw: unknown = undefined
  try {
    if (hasWailsApp()) {
      const mod = await import('@/wailsjs/wailsjs/go/main/App')
      const json = await mod.LoadSettingsJSON()
      const parsed = JSON.parse(json) as unknown
      if (parsed && typeof parsed === 'object') {
        legacyRaw = (parsed as Record<string, unknown>).clients
      }
    }
  } catch {}

  const legacy = normalizeClients(legacyRaw)
  if (legacy.length === 0) return []

  await saveClients(legacy)
  return legacy
}

