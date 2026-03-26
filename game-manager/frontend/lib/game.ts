export type Game = {
  id: number
  name: string
  exePath: string
  args: string
  category: string
  group: string
  tags: string[]
  platform: string
  status: 'Installed' | 'Not Installed'
  coverRelPath?: string
  exeIconRelPath?: string
  allowedClientIps: string[]
}

export function normalizeGame(raw: Record<string, unknown>): Game {
  const tagsRaw = raw.tags
  let tags: string[] = []
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.map(String)
  } else if (typeof tagsRaw === 'string') {
    tags = tagsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const allowedClientIpsRaw = raw.allowedClientIps
  let allowedClientIps: string[] = []
  if (Array.isArray(allowedClientIpsRaw)) {
    allowedClientIps = Array.from(
      new Set(
        allowedClientIpsRaw
          .map((v) => String(v).trim())
          .filter(Boolean)
          .map((v) => v.toLowerCase())
      )
    )
  } else if (typeof allowedClientIpsRaw === 'string') {
    allowedClientIps = Array.from(
      new Set(
        allowedClientIpsRaw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      )
    )
  }

  const st = raw.status === 'Not Installed' ? 'Not Installed' : 'Installed'

  return {
    id: Number(raw.id) || 0,
    name: String(raw.name ?? ''),
    exePath: String(raw.exePath ?? raw.path ?? ''),
    args: String(raw.args ?? ''),
    category: String(raw.category ?? ''),
    group: String(raw.group ?? ''),
    tags,
    platform: String(raw.platform ?? ''),
    status: st,
    coverRelPath: raw.coverRelPath != null ? String(raw.coverRelPath) : undefined,
    exeIconRelPath: raw.exeIconRelPath != null ? String(raw.exeIconRelPath) : undefined,
    allowedClientIps,
  }
}

export function nextGameId(games: Game[]): number {
  if (games.length === 0) return 1
  return Math.max(...games.map((g) => g.id)) + 1
}

export function guessPlatform(exePath: string): string {
  const lower = exePath.replace(/\\/g, '/').toLowerCase()
  if (lower.includes('steam')) return 'Steam'
  if (lower.includes('gog')) return 'GOG'
  if (lower.includes('epic')) return 'Epic'
  if (lower.includes('ubisoft')) return 'Ubisoft'
  return exePath.trim() ? 'Local' : ''
}
