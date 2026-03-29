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
  ExtractExecutableIcon,
  PickExecutableFile,
  PickImageFile,
  GetCoverDataURL,
  ReadImageFileDataURL,
  ImportGameIcon,
} from '@/wailsjs/wailsjs/go/main/App'
import { Check, ChevronsUpDown, X } from 'lucide-react'
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

  const [name, setName] = useState('')
  const [exePath, setExePath] = useState('')
  const [exeIconRelPath, setExeIconRelPath] = useState('')
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
  const coverFileInputRef = useRef<HTMLInputElement>(null)
  const customIconFileInputRef = useRef<HTMLInputElement>(null)
  const [customIconRelPath, setCustomIconRelPath] = useState('')
  const [customIconDataUrl, setCustomIconDataUrl] = useState('')
  const [iconSourcePath, setIconSourcePath] = useState('')
  const [coverImgReady, setCoverImgReady] = useState(false)
  const [iconImgReady, setIconImgReady] = useState(false)

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
  const iconDisplayUrl = (customIconDataUrl || iconDiskQuery.data || '').trim()

  const coverDiskLoading =
    open && mode === 'edit' && !!editCoverRelPath && !coverPreviewUrl && coverDiskQuery.isPending
  const iconDiskLoading =
    open && mode === 'edit' && !!editExeIconRelPath && !customIconDataUrl && iconDiskQuery.isPending

  const coverSkeletonVisible = coverDiskLoading || (!!coverDisplayUrl && !coverImgReady)
  const iconSkeletonVisible = iconDiskLoading || (!!iconDisplayUrl && !iconImgReady)

  useEffect(() => {
    if (!open) return

    if (mode === 'edit' && initialGame) {
      setName(initialGame.name)
      setExePath(initialGame.exePath)
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
      return
    }

    setName('')
    setExePath('')
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

  const onExeFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setExePath(file.name)
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
    const exeUnchanged =
      mode === 'edit' && !!initialGame && exeTrim === initialGame.exePath.trim()

    let coverRelPath: string | undefined =
      mode === 'edit' && initialGame ? initialGame.coverRelPath : undefined

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
    } else if (exeTrim && hasWailsApp()) {
      const shouldExtractIcon = !exeUnchanged
      if (shouldExtractIcon) {
        try {
          const extracted = await ExtractExecutableIcon(exeTrim)
          if (extracted) iconRelPath = extracted
        } catch {
          /* still save game without icon */
        }
      }
    }

    const iconRelToSave =
      iconRelPath?.trim() ||
      (exeUnchanged && !iconSourcePath.trim() ? initialGame?.exeIconRelPath?.trim() : undefined) ||
      undefined

    const platform =
      exeUnchanged && initialGame ? initialGame.platform : guessPlatform(exePath)
    const status: Game['status'] =
      exeUnchanged && initialGame
        ? initialGame.status
        : exeTrim
          ? 'Installed'
          : 'Not Installed'

    const game: Game = {
      id,
      name: name.trim(),
      exePath: exeTrim,
      args: args.trim(),
      category: categorySelection.join(', '),
      group: groupSelection.join(', '),
      tags: tagSelection,
      platform,
      status,
      coverRelPath,
      exeIconRelPath: iconRelToSave ? iconRelToSave : undefined,
      allowedClientIps,
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
                  'pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm text-theme-muted',
                  coverDisplayUrl || coverSkeletonVisible ? 'z-0' : 'z-[1]',
                )}
                aria-hidden={!!coverDisplayUrl || coverSkeletonVisible}
              >
                <span className={cn((coverDisplayUrl || coverSkeletonVisible) && 'sr-only')}>
                  No Image
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
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="text-sm text-theme-muted">
                Game Name
              </label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Game name..."
                autoFocus
                className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm text-theme-muted">Path to EXE</span>
              <div className="flex gap-2">
                <Input
                  readOnly={hasWailsApp()}
                  value={exePath}
                  onChange={(e) => setExePath(e.target.value)}
                  placeholder={
                    hasWailsApp()
                      ? 'Select executable'
                      : 'Pick a file or paste full path (browser dev)'
                  }
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

            <div className="space-y-1.5">
              <label htmlFor={argsId} className="text-sm text-theme-muted">
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
                <span className="text-sm text-theme-muted" id={`${formId}-category-label`}>
                  Category
                </span>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
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
                <span className="text-sm text-theme-muted" id={`${formId}-tags-label`}>
                  Tags
                </span>
                <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
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
                <span className="text-sm text-theme-muted">Allowed Clients</span>
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
              <Popover open={clientsOpen} onOpenChange={setClientsOpen}>
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
                              <span className="text-xs uppercase text-theme-primary">&nbsp;{client.type}</span>
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
                        <span className="text-xs uppercase text-theme-primary">&nbsp;{client?.type}</span>
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
