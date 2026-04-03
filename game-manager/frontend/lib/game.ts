export type Game = {
  id: number
  name: string
  exePath: string
  /** Controls how the client launches this game. */
  launchType?: 'exe' | 'script'
  /** Optional BAT/CMD/PowerShell script used when `launchType === 'script'`. */
  scriptPath?: string
  /** Optional BAT/CMD script executed before the main game launcher. */
  preLaunchScriptPath?: string
  args: string
  category: string
  group: string
  tags: string[]
  platform: string
  status: 'Installed' | 'Not Installed'
  coverRelPath?: string
  /** IGDB screenshot_big (popular strip) under data/popular/ */
  popularImageRelPath?: string
  exeIconRelPath?: string
  /** IGDB game id when metadata came from IGDB */
  igdbGameId?: number
  igdbSummary?: string
  igdbStoryline?: string
  igdbReleaseSec?: number
  igdbGenres?: string[]
  igdbTrailerYouTubeId?: string
  /** IGDB CDN screenshot URLs for client / manager previews */
  igdbScreenshotUrls?: string[]
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

  const scriptPathRaw = raw.scriptPath
  const scriptPath = scriptPathRaw != null ? String(scriptPathRaw) : undefined

  const preLaunchRaw = raw.preLaunchScriptPath
  const preLaunchScriptPath = preLaunchRaw != null ? String(preLaunchRaw) : undefined

  const launchTypeRaw = raw.launchType != null ? String(raw.launchType) : ''
  const exeTrimForInference = String(raw.exePath ?? raw.path ?? '').trim().toLowerCase()
  const scriptTrimForInference = (scriptPath ?? '').trim().toLowerCase()

  const inferredLaunchType: 'exe' | 'script' =
    launchTypeRaw === 'script'
      ? 'script'
      : launchTypeRaw === 'exe'
        ? 'exe'
        : scriptTrimForInference
          ? 'script'
          : exeTrimForInference.endsWith('.bat') || exeTrimForInference.endsWith('.cmd') || exeTrimForInference.endsWith('.ps1')
            ? 'script'
            : 'exe'

  return {
    id: Number(raw.id) || 0,
    name: String(raw.name ?? ''),
    exePath: String(raw.exePath ?? raw.path ?? ''),
    launchType: inferredLaunchType,
    scriptPath: scriptPath?.trim() ? scriptPath : undefined,
    preLaunchScriptPath: preLaunchScriptPath?.trim() ? preLaunchScriptPath : undefined,
    args: String(raw.args ?? ''),
    category: String(raw.category ?? ''),
    group: String(raw.group ?? ''),
    tags,
    platform: String(raw.platform ?? ''),
    status: st,
    coverRelPath: raw.coverRelPath != null ? String(raw.coverRelPath) : undefined,
    popularImageRelPath:
      raw.popularImageRelPath != null ? String(raw.popularImageRelPath) : undefined,
    exeIconRelPath: raw.exeIconRelPath != null ? String(raw.exeIconRelPath) : undefined,
    igdbGameId:
      raw.igdbGameId != null && !Number.isNaN(Number(raw.igdbGameId))
        ? Number(raw.igdbGameId)
        : undefined,
    igdbSummary: raw.igdbSummary != null ? String(raw.igdbSummary) : undefined,
    igdbStoryline: raw.igdbStoryline != null ? String(raw.igdbStoryline) : undefined,
    igdbReleaseSec:
      raw.igdbReleaseSec != null && !Number.isNaN(Number(raw.igdbReleaseSec))
        ? Number(raw.igdbReleaseSec)
        : undefined,
    igdbGenres: Array.isArray(raw.igdbGenres)
      ? raw.igdbGenres.map(String).filter((s) => s.trim())
      : undefined,
    igdbTrailerYouTubeId:
      raw.igdbTrailerYouTubeId != null ? String(raw.igdbTrailerYouTubeId) : undefined,
    igdbScreenshotUrls: Array.isArray(raw.igdbScreenshotUrls)
      ? raw.igdbScreenshotUrls.map(String).filter((s) => s.trim())
      : undefined,
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
