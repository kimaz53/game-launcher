import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Game } from '@/lib/game'
import { guessPlatform, nextGameId } from '@/lib/game'
import { hasWailsApp, loadGames, saveGames } from '@/lib/games-storage'
import { yieldForNativeFileDialog } from '@/lib/yield-for-native-file-dialog'
import { loadCategories } from '@/lib/categories-storage'
import { loadTags } from '@/lib/tags-storage'
import { loadClients } from '@/lib/clients-storage'
import {
  ImportCoverImage,
  ImportPopularImage,
  ExtractExecutableIcon,
  PickExecutableFile,
  PickScriptFile,
  PickImageFile,
  GetCoverDataURL,
  ReadImageFileDataURL,
  ImportGameIcon,
  IGDBCredentialsConfigured,
  IGDBEnvHintPath,
  IGDBSearchGames,
  IGDBFetchGameArt,
} from '@/wailsjs/wailsjs/go/main/App'
import { Check, ChevronsUpDown, Film, ImageIcon, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type AddGameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  mode?: 'add' | 'edit'
  initialGame?: Game
}

function normalizeClientIp(ip: string): string {
  return ip.trim().toLowerCase()
}

function dedupeClientIps(ips: string[]): string[] {
  const seen: Record<string, true> = {}
  const out: string[] = []
  for (const v of ips) {
    const k = normalizeClientIp(v)
    if (!k || seen[k]) continue
    seen[k] = true
    out.push(k)
  }
  return out
}

type IgdbSearchRow = {
  id: number
  name: string
  coverImageId?: string
  releaseSec?: number
}

function igdbThumbUrl(coverImageId: string) {
  const id = coverImageId.trim()
  if (!id) return ''
  return `https://images.igdb.com/igdb/image/upload/t_thumb/${id}.jpg`
}

export function AddGameDialog({
  open,
  onOpenChange,
  onSaved,
  mode = 'add',
  initialGame,
}: AddGameDialogProps) {
  const formId = useId()
  const nameId = `${formId}-name`
  const argsId = `${formId}-args`
  const categoryId = `${formId}-category`
  const groupId = `${formId}-group`
  const tagId = `${formId}-tags`
  const launchExeId = `${formId}-launch-exe`
  const launchScriptId = `${formId}-launch-script`

  const [name, setName] = useState('')
  const [exePath, setExePath] = useState('')
  const [exeIconRelPath, setExeIconRelPath] = useState('')
  const [launchType, setLaunchType] = useState<'exe' | 'script'>('exe')
  const [scriptPath, setScriptPath] = useState('')
  const [preLaunchScriptPath, setPreLaunchScriptPath] = useState('')
  const [args, setArgs] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [categorySelection, setCategorySelection] = useState<string[]>([])
  const [groupSelection, setGroupSelection] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [tagSelection, setTagSelection] = useState<string[]>([])
  const [clientOptions, setClientOptions] = useState<Array<{ ip: string; name: string; type: string }>>([])
  const [allowedClientIps, setAllowedClientIps] = useState<string[]>([])
  const [clientsOpen, setClientsOpen] = useState(false)
  const [coverSourcePath, setCoverSourcePath] = useState('')
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const exeFileInputRef = useRef<HTMLInputElement>(null)
  const scriptFileInputRef = useRef<HTMLInputElement>(null)
  const preLaunchFileInputRef = useRef<HTMLInputElement>(null)
  const coverFileInputRef = useRef<HTMLInputElement>(null)
  const customIconFileInputRef = useRef<HTMLInputElement>(null)
  const [customIconRelPath, setCustomIconRelPath] = useState('')
  const [customIconDataUrl, setCustomIconDataUrl] = useState('')
  const [iconSourcePath, setIconSourcePath] = useState('')
  const [coverImgReady, setCoverImgReady] = useState(false)
  const [iconImgReady, setIconImgReady] = useState(false)
  const [popularScreenshotSourcePath, setPopularScreenshotSourcePath] = useState('')

  const [igdbGameId, setIgdbGameId] = useState(0)
  const [igdbSummary, setIgdbSummary] = useState('')
  const [igdbStoryline, setIgdbStoryline] = useState('')
  const [igdbReleaseSec, setIgdbReleaseSec] = useState<number | undefined>(undefined)
  const [igdbGenres, setIgdbGenres] = useState<string[]>([])
  const [igdbTrailerYouTubeId, setIgdbTrailerYouTubeId] = useState('')
  const [igdbScreenshotUrls, setIgdbScreenshotUrls] = useState<string[]>([])

  const [igdbConfigured, setIgdbConfigured] = useState(false)
  const [igdbEnvHint, setIgdbEnvHint] = useState('')
  const [igdbOpen, setIgdbOpen] = useState(false)
  const [igdbSearchInput, setIgdbSearchInput] = useState('')
  const [igdbResults, setIgdbResults] = useState<IgdbSearchRow[]>([])
  const [igdbSearching, setIgdbSearching] = useState(false)
  const [igdbApplying, setIgdbApplying] = useState(false)
  const igdbSearchSeq = useRef(0)

  const editCoverRelPath =
    mode === 'edit' && initialGame?.coverRelPath?.trim() ? initialGame.coverRelPath.trim() : ''
  const editExeIconRelPath =
    mode === 'edit' && initialGame?.exeIconRelPath?.trim()
      ? initialGame.exeIconRelPath.trim()
      : ''
  const coverDiskQuery = useQuery({
    queryKey: ['wails', 'GetCoverDataURL', 'cover', initialGame?.id, editCoverRelPath] as const,
    queryFn: async () => (await GetCoverDataURL(editCoverRelPath)) || '',
    enabled: open && mode === 'edit' && !!editCoverRelPath && hasWailsApp(),
    staleTime: Infinity,
    gcTime: 15 * 60 * 1000,
  })

  const iconDiskQuery = useQuery({
    queryKey: ['wails', 'GetCoverDataURL', 'exeIcon', initialGame?.id, editExeIconRelPath] as const,
    queryFn: async () => (await GetCoverDataURL(editExeIconRelPath)) || '',
    enabled: open && mode === 'edit' && !!editExeIconRelPath && hasWailsApp(),
    staleTime: Infinity,
    gcTime: 15 * 60 * 1000,
  })

  const coverDisplayUrl = (coverPreviewUrl || coverDiskQuery.data || '').trim()
  // Once a new custom icon source is picked, stop falling back to the old persisted icon.
  const iconDisplayUrl = (customIconDataUrl || (!iconSourcePath.trim() ? iconDiskQuery.data : '') || '').trim()

  const coverDiskLoading =
    open && mode === 'edit' && !!editCoverRelPath && !coverPreviewUrl && coverDiskQuery.isPending
  const iconDiskLoading =
    open && mode === 'edit' && !!editExeIconRelPath && !customIconDataUrl && iconDiskQuery.isPending

  const coverSkeletonVisible = coverDiskLoading || (!!coverDisplayUrl && !coverImgReady)
  const iconSkeletonVisible = iconDiskLoading || (!!iconDisplayUrl && !iconImgReady)

  useEffect(() => {
    if (!open || !hasWailsApp()) return
    void (async () => {
      try {
        const ok = await IGDBCredentialsConfigured()
        setIgdbConfigured(ok)
        if (!ok) {
          const hint = (await IGDBEnvHintPath()) || 'igdb.local.env'
          setIgdbEnvHint(hint)
        }
      } catch {
        setIgdbConfigured(false)
      }
    })()
  }, [open])

  useEffect(() => {
    if (!igdbOpen) return
    const q = igdbSearchInput.trim()
    if (q.length < 2) {
      setIgdbResults([])
      setIgdbSearching(false)
      return
    }
    const seq = ++igdbSearchSeq.current
    setIgdbSearching(true)
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const raw = await IGDBSearchGames(q)
          if (seq !== igdbSearchSeq.current) return
          const parsed = JSON.parse(raw) as unknown
          const rows = Array.isArray(parsed)
            ? parsed.filter(
              (r): r is IgdbSearchRow =>
                typeof r === 'object' &&
                r !== null &&
                typeof (r as IgdbSearchRow).id === 'number' &&
                typeof (r as IgdbSearchRow).name === 'string',
            )
            : []
          setIgdbResults(rows)
        } catch {
          if (seq !== igdbSearchSeq.current) return
          setIgdbResults([])
        } finally {
          if (seq === igdbSearchSeq.current) setIgdbSearching(false)
        }
      })()
    }, 480)
    return () => {
      window.clearTimeout(t)
    }
  }, [igdbOpen, igdbSearchInput])

  useEffect(() => {
    if (!open) return

    if (mode === 'edit' && initialGame) {
      setName(initialGame.name)
      setExePath(initialGame.exePath)
      setLaunchType(initialGame.launchType === 'script' ? 'script' : 'exe')
      setScriptPath(initialGame.scriptPath ?? '')
      setPreLaunchScriptPath(initialGame.preLaunchScriptPath ?? '')
      setExeIconRelPath(initialGame.exeIconRelPath ?? '')
      setArgs(initialGame.args)
      setCategorySelection(
        (initialGame.category ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
      setGroupSelection(
        (initialGame.group ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
      setTagSelection(initialGame.tags ?? [])
      setAllowedClientIps(dedupeClientIps(initialGame.allowedClientIps ?? []))
      setCoverSourcePath('')
      setCoverPreviewUrl('')
      setIconSourcePath('')
      setCustomIconRelPath('')
      setCustomIconDataUrl('')
      setPopularScreenshotSourcePath('')
      setIgdbGameId(initialGame.igdbGameId ?? 0)
      setIgdbSummary((initialGame.igdbSummary ?? '').trim())
      setIgdbStoryline((initialGame.igdbStoryline ?? '').trim())
      setIgdbReleaseSec(
        typeof initialGame.igdbReleaseSec === 'number' ? initialGame.igdbReleaseSec : undefined,
      )
      setIgdbGenres(initialGame.igdbGenres?.length ? [...initialGame.igdbGenres] : [])
      setIgdbTrailerYouTubeId((initialGame.igdbTrailerYouTubeId ?? '').trim())
      setIgdbScreenshotUrls(
        initialGame.igdbScreenshotUrls?.length ? [...initialGame.igdbScreenshotUrls] : [],
      )
      return
    }

    setName('')
    setExePath('')
    setLaunchType('exe')
    setScriptPath('')
    setPreLaunchScriptPath('')
    setExeIconRelPath('')
    setArgs('')
    setCategorySelection([])
    setGroupSelection([])
    setTagSelection([])
    setAllowedClientIps([])
    setCoverSourcePath('')
    setCoverPreviewUrl('')
    setCustomIconRelPath('')
    setCustomIconDataUrl('')
    setIconSourcePath('')
    setIgdbOpen(false)
    setIgdbSearchInput('')
    setIgdbResults([])
    setIgdbSearching(false)
    setIgdbApplying(false)
    setPopularScreenshotSourcePath('')
    setIgdbGameId(0)
    setIgdbSummary('')
    setIgdbStoryline('')
    setIgdbReleaseSec(undefined)
    setIgdbGenres([])
    setIgdbTrailerYouTubeId('')
    setIgdbScreenshotUrls([])
  }, [open, mode, initialGame])

  useEffect(() => {
    setCoverImgReady(false)
  }, [coverDisplayUrl])

  useEffect(() => {
    setIconImgReady(false)
  }, [iconDisplayUrl])

  useEffect(() => {
    if (!open) return
    const run = async () => {
      const storedCats = await loadCategories()
      const storedCatNames = storedCats.map((c) => c.name)
      const initCats =
        mode === 'edit' && initialGame
          ? (initialGame.category ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          : []
      const mergedCats = Array.from(
        new Set([...storedCatNames, ...initCats])
      )
      setCategoryOptions(mergedCats)

      const storedTags = await loadTags()
      const initTags = mode === 'edit' && initialGame ? initialGame.tags : []
      const mergedTags = Array.from(new Set([...storedTags, ...initTags]))
      setTagOptions(mergedTags)

      const storedClients = await loadClients()
      setClientOptions(storedClients.map((c) => ({ ip: c.ip, name: c.name, type: c.type })))
    }

    void run()
  }, [open, mode, initialGame])

  useEffect(() => {
    return () => {
      if (coverPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(coverPreviewUrl)
    }
  }, [coverPreviewUrl])

  const pickExecutable = async () => {
    if (hasWailsApp()) {
      await yieldForNativeFileDialog()
      const picked = await PickExecutableFile()
      if (!picked) return
      setExePath(picked)
      try {
        const iconRel = await ExtractExecutableIcon(picked)
        if (iconRel) {
          setExeIconRelPath(iconRel)
          if (!iconSourcePath.trim()) {
            const dataUrl = await GetCoverDataURL(iconRel)
            if (dataUrl) setCustomIconDataUrl(dataUrl)
          }
        }
      } catch {
        /* ignore; still allow adding game without exe icon */
      }
      return
    }
    exeFileInputRef.current?.click()
  }

  const pickScriptLauncher = async () => {
    if (hasWailsApp()) {
      await yieldForNativeFileDialog()
      const picked = await PickScriptFile()
      if (!picked) return
      setScriptPath(picked)
      return
    }
    scriptFileInputRef.current?.click()
  }

  const onExeFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setExePath(file.name)
  }

  const onScriptFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setScriptPath(file.name)
  }

  const pickPreLaunchScript = async () => {
    if (hasWailsApp()) {
      await yieldForNativeFileDialog()
      const picked = await PickScriptFile()
      if (!picked) return
      setPreLaunchScriptPath(picked)
      return
    }
    preLaunchFileInputRef.current?.click()
  }

  const onPreLaunchFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setPreLaunchScriptPath(file.name)
  }

  const pickCover = async () => {
    if (hasWailsApp()) {
      await yieldForNativeFileDialog()
      const picked = await PickImageFile()
      if (!picked) return
      setCoverSourcePath(picked)
      const dataUrl = await ReadImageFileDataURL(picked)
      setCoverPreviewUrl(dataUrl || '')
      return
    }
    coverFileInputRef.current?.click()
  }

  const onCoverFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    setCoverSourcePath('')
    setCoverPreviewUrl(URL.createObjectURL(file))
  }

  const pickCustomIcon = async () => {
    if (hasWailsApp()) {
      await yieldForNativeFileDialog()
      const picked = await PickImageFile()
      if (!picked) return

      setIconSourcePath(picked)
      const lower = picked.toLowerCase()
      const isExeLike = lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd') || lower.endsWith('.lnk')

      if (!isExeLike) {
        const previewUrl = await ReadImageFileDataURL(picked)
        setCustomIconDataUrl(previewUrl || '')
      } else {
        setCustomIconDataUrl('')
      }
      return
    }

    customIconFileInputRef.current?.click()
  }

  const onCustomIconPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      setCustomIconDataUrl('')
      setIconSourcePath('')
      return
    }

    // Only create data URL for image files that can be previewed
    if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.ico')) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.onerror = () => resolve('')
        reader.readAsDataURL(file)
      })
      setCustomIconDataUrl(dataUrl || '')
    } else {
      // For exe files, we can't preview them in browser
      setCustomIconDataUrl('')
    }

    setIconSourcePath('')
  }

  const handleSave = async () => {
    if (!name.trim()) return

    const existing = await loadGames()
    const id = mode === 'edit' && initialGame ? initialGame.id : nextGameId(existing)

    const exeTrim = exePath.trim()
    const scriptTrim = scriptPath.trim()
    const preLaunchTrim = preLaunchScriptPath.trim()

    const effectiveLaunchTrim = launchType === 'script' ? scriptTrim : exeTrim
    const effectiveLaunchUnchanged =
      mode === 'edit' &&
      !!initialGame &&
      effectiveLaunchTrim === (launchType === 'script' ? initialGame.scriptPath?.trim() ?? '' : initialGame.exePath.trim())

    let coverRelPath: string | undefined =
      mode === 'edit' && initialGame ? initialGame.coverRelPath : undefined
    let popularImageRelPath: string | undefined =
      mode === 'edit' && initialGame ? initialGame.popularImageRelPath : undefined

    if (popularScreenshotSourcePath.trim() && hasWailsApp()) {
      try {
        const imported = await ImportPopularImage(popularScreenshotSourcePath, id)
        if (imported) popularImageRelPath = imported
      } catch {
        /* keep previous */
      }
    }

    if (coverSourcePath.trim() && hasWailsApp()) {
      try {
        const imported = await ImportCoverImage(coverSourcePath, id)
        if (imported) coverRelPath = imported
      } catch {
        /* still save game without cover */
      }
    }

    let iconRelPath: string | undefined

    if (iconSourcePath.trim() && hasWailsApp()) {
      try {
        const imported = await ImportGameIcon(iconSourcePath)
        if (imported) iconRelPath = imported
      } catch {
        /* still save game without icon */
      }
    } else if (effectiveLaunchTrim && hasWailsApp()) {
      const shouldExtractIcon = !effectiveLaunchUnchanged
      if (shouldExtractIcon) {
        try {
          const extracted = await ExtractExecutableIcon(effectiveLaunchTrim)
          if (extracted) iconRelPath = extracted
        } catch {
          /* still save game without icon */
        }
      }
    }

    const iconRelToSave =
      iconRelPath?.trim() ||
      (effectiveLaunchUnchanged && !iconSourcePath.trim() ? initialGame?.exeIconRelPath?.trim() : undefined) ||
      undefined

    const platform =
      effectiveLaunchUnchanged && initialGame ? initialGame.platform : guessPlatform(effectiveLaunchTrim)
    const status: Game['status'] =
      effectiveLaunchUnchanged && initialGame
        ? initialGame.status
        : effectiveLaunchTrim
          ? 'Installed'
          : 'Not Installed'

    const igdbPayload =
      igdbGameId > 0
        ? ({
            igdbGameId,
            ...(igdbSummary.trim() ? { igdbSummary: igdbSummary.trim() } : {}),
            ...(igdbStoryline.trim() ? { igdbStoryline: igdbStoryline.trim() } : {}),
            ...(typeof igdbReleaseSec === 'number' ? { igdbReleaseSec } : {}),
            ...(igdbGenres.length ? { igdbGenres: [...igdbGenres] } : {}),
            ...(igdbTrailerYouTubeId.trim()
              ? { igdbTrailerYouTubeId: igdbTrailerYouTubeId.trim() }
              : {}),
            ...(igdbScreenshotUrls.length ? { igdbScreenshotUrls: [...igdbScreenshotUrls] } : {}),
          } satisfies Partial<Game>)
        : {}

    const game: Game = {
      id,
      name: name.trim(),
      exePath: exeTrim,
      launchType,
      scriptPath: scriptTrim || undefined,
      preLaunchScriptPath: preLaunchTrim || undefined,
      args: args.trim(),
      category: categorySelection.join(', '),
      group: groupSelection.join(', '),
      tags: tagSelection,
      platform,
      status,
      coverRelPath,
      popularImageRelPath,
      exeIconRelPath: iconRelToSave ? iconRelToSave : undefined,
      allowedClientIps,
      ...igdbPayload,
    }

    if (mode === 'edit' && initialGame) {
      await saveGames(existing.map((g) => (g.id === id ? game : g)))
    } else {
      await saveGames([...existing, game])
    }
    onOpenChange(false)
    onSaved?.()
  }

  const selectClass =
    'min-h-[132px] w-full rounded-lg border border-theme-border bg-theme-app px-2 py-1.5 text-sm text-theme-text outline-none focus:border-theme-accent'

  const allowedClientLabel = (ip: string) => {
    const key = normalizeClientIp(ip)
    const found = clientOptions.find((c) => normalizeClientIp(c.ip) === key)
    return found ? `${found.name} (${found.ip})` : ip
  }

  const toggleAllowedClient = (ip: string) => {
    const key = normalizeClientIp(ip)
    setAllowedClientIps((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]))
  }

  const selectAllowedClientsByType = (clientType: 'vip' | 'non-vip') => {
    setAllowedClientIps(
      dedupeClientIps(clientOptions.filter((c) => c.type === clientType).map((c) => c.ip)),
    )
  }

  const toggleCategory = (cat: string) => {
    setCategorySelection((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])
  }

  const toggleTag = (tag: string) => {
    setTagSelection((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  const onIgdbPopoverOpenChange = (next: boolean) => {
    setIgdbOpen(next)
    if (!next) {
      setIgdbSearchInput('')
      setIgdbResults([])
      setIgdbSearching(false)
      igdbSearchSeq.current += 1
    }
  }

  const applyIgdbSelection = async (row: IgdbSearchRow) => {
    if (!hasWailsApp() || igdbApplying) return
    setIgdbApplying(true)
    try {
      const raw = await IGDBFetchGameArt(row.id)
      const data = JSON.parse(raw) as {
        igdbId?: number
        name?: string
        coverPath?: string
        iconPath?: string
        screenshotPath?: string
        summary?: string
        storyline?: string
        releaseSec?: number
        genres?: string[]
        trailerYouTubeId?: string
        screenshotUrls?: string[]
      }
      const gid = typeof data.igdbId === 'number' ? data.igdbId : row.id
      const genreTags = Array.isArray(data.genres)
        ? data.genres.map((s) => String(s).trim()).filter((s) => s.length > 0)
        : []
      setIgdbGameId(gid)
      setIgdbSummary((data.summary ?? '').trim())
      setIgdbStoryline((data.storyline ?? '').trim())
      setIgdbReleaseSec(typeof data.releaseSec === 'number' ? data.releaseSec : undefined)
      setIgdbGenres(genreTags)
      if (genreTags.length > 0) {
        setTagOptions((prev) => Array.from(new Set([...prev, ...genreTags])))
        setTagSelection((prev) => Array.from(new Set([...prev, ...genreTags])))
      }
      setIgdbTrailerYouTubeId((data.trailerYouTubeId ?? '').trim())
      setIgdbScreenshotUrls(
        Array.isArray(data.screenshotUrls) ? data.screenshotUrls.map(String).filter((s) => s.trim()) : [],
      )
      const title = (data.name ?? row.name ?? '').trim()
      if (title) setName(title)
      const coverP = (data.coverPath ?? '').trim()
      if (coverP) {
        setCoverSourcePath(coverP)
        const u = await ReadImageFileDataURL(coverP)
        setCoverPreviewUrl(u || '')
      }
      const shotP = (data.screenshotPath ?? '').trim()
      if (shotP) {
        setPopularScreenshotSourcePath(shotP)
      }
      const iconP = (data.iconPath ?? '').trim()
      if (iconP) {
        setIconSourcePath(iconP)
        const u = await ReadImageFileDataURL(iconP)
        setCustomIconDataUrl(u || '')
        setExeIconRelPath('')
      }
      onIgdbPopoverOpenChange(false)
    } catch {
      /* leave form unchanged */
    } finally {
      setIgdbApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-theme-border bg-theme-sidebar p-6 text-theme-text">
        <input
          ref={exeFileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".exe,.bat,.cmd,.lnk,application/x-msdownload"
          aria-hidden
          onChange={onExeFilePicked}
        />
        <input
          ref={scriptFileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".bat,.cmd,.ps1,application/x-msdownload"
          aria-hidden
          onChange={onScriptFilePicked}
        />
        <input
          ref={preLaunchFileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".bat,.cmd,.ps1,application/x-msdownload"
          aria-hidden
          onChange={onPreLaunchFilePicked}
        />
        <input
          ref={coverFileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept="image/*"
          aria-hidden
          onChange={onCoverFilePicked}
        />
        <input
          ref={customIconFileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.ico,.exe,.bat,.cmd,.lnk"
          aria-hidden
          onChange={(e) => void onCustomIconPicked(e)}
        />
        <DialogHeader>
          <DialogTitle className="text-theme-text">
            {mode === 'edit' ? 'Edit Game' : 'Add Game'}
          </DialogTitle>
          <DialogDescription className="text-theme-muted">
            Games are stored next to the app in{' '}
            <span className="font-mono text-theme-secondary-text">data/games.json</span> (portable).
            Cover art is copied under{' '}
            <span className="font-mono text-theme-secondary-text">data/covers/</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="wails-no-drag flex flex-col gap-6 sm:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-44">
            <div className="relative w-full aspect-[3/4] shrink-0 overflow-hidden rounded-xl border border-theme-border bg-theme-card">
              <div
                className={cn(
                  'font-display pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm text-theme-muted',
                  coverDisplayUrl || coverSkeletonVisible ? 'z-0' : 'z-[1]',
                )}
                aria-hidden={!!coverDisplayUrl || coverSkeletonVisible}
              >
                <span className={cn('font-display', (coverDisplayUrl || coverSkeletonVisible) && 'sr-only')}>
                  Cover Image
                </span>
              </div>
              {coverSkeletonVisible ? (
                <Skeleton
                  className="pointer-events-none absolute inset-0 z-[2] rounded-xl"
                  aria-hidden
                />
              ) : null}
              {coverDisplayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={coverDisplayUrl}
                  src={coverDisplayUrl}
                  alt=""
                  className={cn(
                    'absolute inset-0 z-[1] h-full w-full rounded-xl object-cover transition-opacity duration-200',
                    coverImgReady ? 'opacity-100' : 'opacity-0',
                  )}
                  onLoad={() => setCoverImgReady(true)}
                  onError={() => setCoverImgReady(true)}
                />
              ) : null}
            </div>
            <Button
              type="button"
              className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
              onClick={() => void pickCover()}
            >
              Browse
            </Button>



            <div className="space-y-1.5">
              <span className="text-sm text-theme-muted">Game Icon</span>
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-theme-border bg-theme-card">
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-0 flex items-center justify-center',
                      iconDisplayUrl || iconSkeletonVisible ? 'z-0' : 'z-[1]',
                    )}
                    aria-hidden={!!iconDisplayUrl || iconSkeletonVisible}
                  >
                    <span
                      className={cn(
                        'text-sm font-semibold text-theme-muted',
                        (iconDisplayUrl || iconSkeletonVisible) && 'sr-only',
                      )}
                    >
                      ?
                    </span>
                  </div>
                  {iconSkeletonVisible ? (
                    <Skeleton
                      className="pointer-events-none absolute inset-0 z-[2] rounded-md"
                      aria-hidden
                    />
                  ) : null}
                  {iconDisplayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={iconDisplayUrl}
                      src={iconDisplayUrl}
                      alt="Game icon preview"
                      className={cn(
                        'absolute inset-0 z-[1] h-full w-full rounded-md object-cover transition-opacity duration-200',
                        iconImgReady ? 'opacity-100' : 'opacity-0',
                      )}
                      onLoad={() => setIconImgReady(true)}
                      onError={() => setIconImgReady(true)}
                    />
                  ) : null}
                </div>
                <Button
                  type="button"
                  className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
                  onClick={() => void pickCustomIcon()}
                >
                  Choose Icon
                </Button>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            {hasWailsApp() && !igdbConfigured ? (
              <div className="space-y-2 rounded-lg border border-theme-border bg-theme-card/40 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-theme-text">IGDB metadata</span>
                  {igdbSearching || igdbApplying ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-theme-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {igdbApplying ? 'Fetching art…' : 'IGDB…'}
                    </span>
                  ) : null}
                </div>
                {!igdbConfigured ? (
                  <p className="text-xs leading-relaxed text-theme-muted">
                    Add Twitch API credentials: copy{' '}
                    <span className="font-mono text-theme-secondary-text">igdb.local.env.example</span> to{' '}
                    <span className="font-mono text-theme-secondary-text">igdb.local.env</span>
                    {igdbEnvHint ? (
                      <>
                        {' '}
                        (e.g. <span className="font-mono text-theme-secondary-text">{igdbEnvHint}</span>)
                      </>
                    ) : null}{' '}
                    — or set{' '}
                    <span className="font-mono">TWITCH_CLIENT_ID</span> /{' '}
                    <span className="font-mono">TWITCH_CLIENT_SECRET</span> in the environment. The app also checks
                    for <span className="font-mono">igdb.local.env</span> next to the executable and a few parent
                    folders (see the project <span className="font-mono">igdb.local.env.example</span>).
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-theme-muted">
                    Fetches cover and icon from IGDB, and the first game screenshot as{' '}
                    <span className="font-mono text-theme-secondary-text">t_screenshot_big</span> for the game
                    client &quot;Popular&quot; strip (saved under <span className="font-mono">data/popular/</span>).
                  </p>
                )}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor={nameId} className="text-sm text-theme-muted">
                Game Name
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Game name..."
                  autoFocus
                  className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                />
                <Popover modal open={igdbOpen} onOpenChange={onIgdbPopoverOpenChange}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-between border-theme-border bg-theme-card text-theme-text hover:bg-theme-secondary-hover"
                      disabled={igdbApplying}
                    >
                      <span className="truncate">Search IGDB by title…</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className={cn("p-0 text-theme-text")}
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type a game name (IGDB)…"
                        value={igdbSearchInput}
                        onValueChange={setIgdbSearchInput}
                      />
                      <CommandList className={cn(
                        igdbResults.length == 0 && !igdbSearching
                          ? 'hidden'
                          : ''
                      )}>
                        {igdbSearching && igdbResults.length === 0 && igdbSearchInput.trim().length >= 2 ? (
                          <div
                            className="flex items-center gap-2 px-3 py-6 text-sm text-theme-muted"
                            role="status"
                            aria-live="polite"
                          >
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                            Searching… (API is rate-limited to ~4 requests per second)
                          </div>
                        ) : null}
                        {!igdbSearching && igdbSearchInput.trim().length >= 2 && igdbResults.length === 0 ? (
                          <CommandEmpty>No IGDB results.</CommandEmpty>
                        ) : null}
                        {igdbSearchInput.trim().length > 0 && igdbSearchInput.trim().length < 2 ? (
                          <div className="px-3 py-4 text-xs text-theme-muted">
                            Enter at least 2 characters. IGDB calls are throttled to respect Twitch API limits.
                          </div>
                        ) : null}
                        <CommandGroup>
                          {igdbResults.map((row) => {
                            const thumb = row.coverImageId ? igdbThumbUrl(row.coverImageId) : ''
                            const year =
                              typeof row.releaseSec === 'number'
                                ? new Date(row.releaseSec * 1000).getUTCFullYear()
                                : null
                            return (
                              <CommandItem
                                key={row.id}
                                value={`${row.name} ${row.id}`}
                                disabled={igdbApplying}
                                onSelect={() => void applyIgdbSelection(row)}
                                className="cursor-pointer h-28"
                              >
                                <div className="flex w-full items-center gap-3">
                                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded border border-theme-border bg-theme-card">
                                    {thumb ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-[10px] text-theme-muted">
                                        —
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="line-clamp-3 text-sm font-medium text-theme-text">{row.name}</div>
                                    {year ? (
                                      <div className="text-xs text-theme-muted">{year}</div>
                                    ) : null}
                                  </div>
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {igdbGameId > 0 ? (
              <div className="space-y-3 rounded-lg border border-theme-border bg-theme-card/40 p-3">
                <div className="text-sm font-medium text-theme-text">IGDB preview</div>
                <div className="flex flex-col gap-3 lg:flex-row">
                  {igdbScreenshotUrls.length > 0 ? (
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-theme-muted">
                        <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Screenshots
                      </div>
                      <div className="flex max-h-40 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                        {igdbScreenshotUrls.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt=""
                            className="h-36 w-auto max-w-[min(100%,14rem)] shrink-0 rounded-md border border-theme-border object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-theme-muted">No screenshots listed in IGDB for this title.</div>
                  )}
                  {igdbTrailerYouTubeId.trim() ? (
                    <div className="w-full shrink-0 space-y-1.5 lg:w-[min(100%,20rem)]">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-theme-muted">
                        <Film className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Trailer
                      </div>
                      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-theme-border bg-black">
                        <iframe
                          title="IGDB trailer preview"
                          className="absolute inset-0 h-full w-full"
                          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(igdbTrailerYouTubeId.trim())}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-theme-muted lg:w-[min(100%,20rem)]">No trailer in IGDB for this title.</div>
                  )}
                </div>
                {igdbSummary.trim() ? (
                  <p className="line-clamp-4 text-xs leading-relaxed text-theme-muted">{igdbSummary.trim()}</p>
                ) : null}
                {igdbGenres.length ? (
                  <div className="flex flex-wrap gap-1">
                    {igdbGenres.map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-theme-border bg-theme-app px-2 py-0.5 text-[10px] text-theme-muted"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <span id={`${formId}-launch-type-label`} className="text-sm text-theme-muted">
                Launch Type
              </span>
              <RadioGroup
                value={launchType}
                onValueChange={(v) => setLaunchType(v as 'exe' | 'script')}
                className="flex flex-col gap-2.5"
                aria-labelledby={`${formId}-launch-type-label`}
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="exe" id={launchExeId} />
                  <label
                    htmlFor={launchExeId}
                    className="cursor-pointer text-sm font-medium leading-none text-theme-text"
                  >
                    Executable (EXE)
                  </label>
                </div>
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="script" id={launchScriptId} />
                  <label
                    htmlFor={launchScriptId}
                    className="cursor-pointer text-sm font-medium leading-none text-theme-text"
                  >
                    Batch/Script (BAT/CMD)
                  </label>
                </div>
              </RadioGroup>
            </div>

            {launchType === 'exe' ? (
              <div className="space-y-1.5">
                <span className="font-display text-sm text-theme-muted">Path to EXE</span>
                <div className="flex gap-2">
                  <Input
                    readOnly={hasWailsApp()}
                    value={exePath}
                    onChange={(e) => setExePath(e.target.value)}
                    placeholder={hasWailsApp() ? 'Select executable' : 'Pick a file or paste full path (browser dev)'}
                    className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                  />
                  <Button
                    type="button"
                    className="shrink-0 bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
                    onClick={() => void pickExecutable()}
                  >
                    Browse
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="font-display text-sm text-theme-muted">Path to Script/BAT</span>
                <div className="flex gap-2">
                  <Input
                    readOnly={hasWailsApp()}
                    value={scriptPath}
                    onChange={(e) => setScriptPath(e.target.value)}
                    placeholder={hasWailsApp() ? 'Select batch/script' : 'Pick a file or paste full path (browser dev)'}
                    className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                  />
                  <Button
                    type="button"
                    className="shrink-0 bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
                    onClick={() => void pickScriptLauncher()}
                  >
                    Browse
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                    onClick={() => setScriptPath('')}
                    disabled={!scriptPath.trim()}
                    aria-label="Clear script path"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="font-display text-sm text-theme-muted">Pre-launch Script/BAT (optional)</span>
              <div className="flex gap-2">
                <Input
                  readOnly={hasWailsApp()}
                  value={preLaunchScriptPath}
                  onChange={(e) => setPreLaunchScriptPath(e.target.value)}
                  placeholder={hasWailsApp() ? 'Select pre-launch script (optional)' : 'Optional: pick a file or paste full path (browser dev)'}
                  className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                />
                <Button
                  type="button"
                  className="shrink-0 bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
                  onClick={() => void pickPreLaunchScript()}
                >
                  Browse
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                  onClick={() => setPreLaunchScriptPath('')}
                  disabled={!preLaunchScriptPath.trim()}
                  aria-label="Clear pre-launch script path"
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={argsId} className="font-display text-sm text-theme-muted">
                Arguments
              </label>
              <Input
                id={argsId}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="Game arguments..."
                className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="font-display text-sm text-theme-muted" id={`${formId}-category-label`}>
                  Category
                </span>
                <Popover modal open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryOpen}
                      className="w-full justify-between border-theme-border bg-theme-card text-theme-text hover:bg-theme-secondary-hover"
                    >
                      {categorySelection.length > 0
                        ? `${categorySelection.length} selected`
                        : 'Select categories'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList>
                        <CommandEmpty>No categories found.</CommandEmpty>
                        <CommandGroup>
                          {categoryOptions.map((c) => {
                            const checked = categorySelection.includes(c)
                            return (
                              <CommandItem key={c} value={c} onSelect={() => toggleCategory(c)}>
                                <Check
                                  className={`mr-2 h-4 w-4 ${checked ? 'opacity-100' : 'opacity-0'}`}
                                />
                                <span>{c}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {categorySelection.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {categorySelection.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-theme-border bg-theme-card px-2 py-1 text-xs text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => toggleCategory(c)}
                      >
                        {c}
                        <X className="h-3 w-3 text-theme-muted" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <span className="font-display text-sm text-theme-muted" id={`${formId}-tags-label`}>
                  Tags
                </span>
                <Popover modal open={tagsOpen} onOpenChange={setTagsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={tagsOpen}
                      className="w-full justify-between border-theme-border bg-theme-card text-theme-text hover:bg-theme-secondary-hover"
                    >
                      {tagSelection.length > 0 ? `${tagSelection.length} selected` : 'Select tags'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search tags..." />
                      <CommandList>
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup>
                          {tagOptions.map((t) => {
                            const checked = tagSelection.includes(t)
                            return (
                              <CommandItem key={t} value={t} onSelect={() => toggleTag(t)}>
                                <Check
                                  className={`mr-2 h-4 w-4 ${checked ? 'opacity-100' : 'opacity-0'}`}
                                />
                                <span>{t}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {tagSelection.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tagSelection.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-theme-border bg-theme-card px-2 py-1 text-xs text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => toggleTag(t)}
                      >
                        {t}
                        <X className="h-3 w-3 text-theme-muted" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-sm text-theme-muted">Allowed Clients</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 bg-theme-secondary text-xs text-theme-text hover:bg-theme-secondary-hover"
                    onClick={() => selectAllowedClientsByType('vip')}
                  >
                    VIP only
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 bg-theme-secondary text-xs text-theme-text hover:bg-theme-secondary-hover"
                    onClick={() => selectAllowedClientsByType('non-vip')}
                  >
                    Non-VIP only
                  </Button>
                </div>
              </div>
              <Popover modal open={clientsOpen} onOpenChange={setClientsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientsOpen}
                    className="w-full justify-between border-theme-border bg-theme-card text-theme-text hover:bg-theme-secondary-hover"
                  >
                    {allowedClientIps.length > 0
                      ? `${allowedClientIps.length} client(s) selected`
                      : 'Select allowed clients'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search clients by name or IP..." />
                    <CommandList>
                      <CommandEmpty>No clients found.</CommandEmpty>
                      <CommandGroup>
                        {clientOptions.map((client) => {
                          const checked = allowedClientIps.includes(normalizeClientIp(client.ip))
                          return (
                            <CommandItem
                              key={client.ip}
                              value={`${client.name} ${client.ip}`}
                              onSelect={() => toggleAllowedClient(client.ip)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${checked ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <span>{client.name}</span>
                              <span className="ml-1 text-xs text-theme-muted font-mono">({client.ip})</span>
                              <span className="font-display text-xs uppercase text-theme-primary">&nbsp;{client.type}</span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {allowedClientIps.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {allowedClientIps.map((ip) => {
                    const client = clientOptions.find((c) => normalizeClientIp(c.ip) === ip)
                    return (
                      <button
                        key={ip}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-theme-border bg-theme-card px-2 py-1 text-xs text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => toggleAllowedClient(ip)}
                      >
                        {allowedClientLabel(ip)}
                        <span className="font-display text-xs uppercase text-theme-primary">&nbsp;{client?.type}</span>
                        <X className="h-3 w-3 text-theme-muted" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="border-theme-border bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
            onClick={() => void handleSave()}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
