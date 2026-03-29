import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { hasWailsApp, loadGames } from '@/lib/games-storage'
import type { Game } from '@/lib/game'
import { loadQuickAccessIds, saveQuickAccessIds } from '@/lib/quick-access-storage'
import { GetDataDir, ReadImageFileDataURL } from '@/wailsjs/wailsjs/go/main/App'
import { FileQuestionMark, GripVertical, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const exeIconDataUrlCache = new Map<string, string>()
let cachedDataDir: string | null = null
let cachedDataDirPromise: Promise<string> | null = null
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='

function setTransparentDragImage(dt: DataTransfer) {
  try {
    const img = new Image()
    img.src = TRANSPARENT_PIXEL
    dt.setDragImage(img, 0, 0)
  } catch {
    // ignore
  }
}

async function getDataDirCached(): Promise<string> {
  if (cachedDataDir) return cachedDataDir
  if (!cachedDataDirPromise) {
    cachedDataDirPromise = GetDataDir()
      .then((d) => {
        cachedDataDir = d
        return d
      })
      .catch(() => '')
  }
  return cachedDataDirPromise
}

function relPathToAbsolute(dataDir: string, relPath: string): string {
  const cleanDataDir = dataDir.replace(/[\\\/]+$/, '')
  const cleanRel = relPath.replace(/^[\\\/]+/, '')
  return `${cleanDataDir}/${cleanRel}`
}

function ExecutableIcon({ relPath, alt }: { relPath?: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!relPath) {
        setSrc(null)
        return
      }

      const cached = exeIconDataUrlCache.get(relPath)
      if (cached) {
        setSrc(cached)
        return
      }

      if (!hasWailsApp()) {
        setSrc(`/${relPath}`)
        return
      }

      const dataDir = await getDataDirCached()
      if (!dataDir) return

      const absolutePath = relPathToAbsolute(dataDir, relPath)
      const dataUrl = await ReadImageFileDataURL(absolutePath)
      if (cancelled) return

      const final = dataUrl || ''
      if (final) exeIconDataUrlCache.set(relPath, final)
      setSrc(final || null)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [relPath])

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="h-10 w-10 rounded-md" />
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-theme-border bg-theme-secondary">
      <FileQuestionMark className="h-5 w-5 text-theme-accent" aria-hidden />
    </div>
  )
}

function moveItem<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0) return arr
  if (fromIndex === toIndex) return arr
  const next = [...arr]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

type AddQuickAccessDialogProps = {
  open: boolean
  onOpenChange: (next: boolean) => void
  games: Game[]
  quickAccessIds: number[]
  onAdd: (gameId: number) => void
}

function AddQuickAccessDialog({ open, onOpenChange, games, quickAccessIds, onAdd }: AddQuickAccessDialogProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = !q
      ? games
      : games.filter((g) => {
          const hay = `${g.name} ${g.category} ${g.group} ${g.tags.join(' ')}`.toLowerCase()
          return hay.includes(q)
        })
    return [...base].sort((a, b) => b.id - a.id)
  }, [games, query])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-2xl border-theme-border bg-theme-sidebar p-6 text-theme-text">
        <DialogHeader>
          <DialogTitle className="text-theme-text">Add Quick Access</DialogTitle>
          <DialogDescription className="text-theme-muted">Pick a game to pin to Quick Access.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games"
            className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
            autoFocus
          />
          <Button
            variant="secondary"
            className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
            type="button"
            disabled
            aria-hidden
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-theme-border bg-theme-app">
          <div className="divide-y divide-theme-border">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-theme-muted">No games found.</div>
            ) : (
              filtered.map((game) => {
                const alreadyPinned = quickAccessIds.includes(game.id)
                return (
                  <div
                    key={game.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-theme-card"
                    role="row"
                  >
                    <ExecutableIcon relPath={game.exeIconRelPath} alt={game.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-theme-text">{game.name}</div>
                      <div className="truncate text-sm text-theme-muted">
                        {game.category}
                        {game.tags.length ? ` • ${game.tags.slice(0, 3).join(', ')}${game.tags.length > 3 ? '…' : ''}` : ''}
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
                      onClick={() => onAdd(game.id)}
                      disabled={alreadyPinned}
                    >
                      {alreadyPinned ? 'Added' : 'Add'}
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter className="mt-3 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="border-theme-border bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type QuickAccessEditorProps = {
  /** When true, used inside Settings (no extra outer scroll shell). */
  embedded?: boolean
  disabled?: boolean
}

export function QuickAccessEditor({ embedded, disabled }: QuickAccessEditorProps) {
  const [games, setGames] = useState<Game[]>([])
  const [quickAccessIds, setQuickAccessIdsState] = useState<number[]>([])
  const [hydrated, setHydrated] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const [g, ids] = await Promise.all([loadGames(), loadQuickAccessIds()])
      if (cancelled) return
      const validIds = ids.filter((id) => g.some((game) => game.id === id))
      setGames(g)
      setQuickAccessIdsState(validIds)
      setHydrated(true)

      const same =
        validIds.length === ids.length && validIds.every((id, i) => id === ids[i])
      if (!same) void saveQuickAccessIds(validIds)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const quickAccessGames = useMemo(() => {
    const map = new Map<number, Game>()
    for (const g of games) map.set(g.id, g)
    return quickAccessIds.map((id) => map.get(id)).filter(Boolean) as Game[]
  }, [games, quickAccessIds])

  const persist = async (next: number[]) => {
    setQuickAccessIdsState(next)
    if (!hydrated) return
    void saveQuickAccessIds(next)
  }

  const handleAdd = async (gameId: number) => {
    if (!hydrated) return
    if (quickAccessIds.includes(gameId)) return
    const next = [...quickAccessIds, gameId]
    await persist(next)
    setAddOpen(false)
  }

  const handleReorder = (fromId: number, toId: number) => {
    if (fromId === toId) return
    const fromIndex = quickAccessIds.indexOf(fromId)
    const toIndex = quickAccessIds.indexOf(toId)
    if (fromIndex === -1 || toIndex === -1) return
    const next = moveItem(quickAccessIds, fromIndex, toIndex)
    void persist(next)
  }

  const handleDeleteQuickAccess = async (gameId: number) => {
    const game = games.find((g) => g.id === gameId)
    const label = game?.name ?? `#${gameId}`
    // const ok = window.confirm(`Remove "${label}" from Quick Access?`)
    // if (!ok) return
    const next = quickAccessIds.filter((id) => id !== gameId)
    await persist(next)
  }

  const inner = (
    <>
      <div className={cn(`flex flex-wrap items-start justify-center gap-3 ${embedded ? '' : ''}`,
        disabled ? 'pointer-events-none' : '',
      )}>
        {quickAccessGames.map((game) => {
          const isDragging = draggingId === game.id
          const isHovered = hoveredId === game.id && draggingId !== null && draggingId !== game.id
          return (
            <div
              key={game.id}
              className={[
                'group relative flex h-16 w-16 items-center justify-center rounded-xl border bg-theme-sidebar',
                'border-theme-border',
                'transition-[transform,opacity,box-shadow] duration-150 ease-out',
                isDragging ? 'scale-[0.98] opacity-40' : 'opacity-100',
                isHovered ? 'shadow-[0_0_0_1px_var(--color-border)] ring-2 ring-theme-primary' : '',
              ].join(' ')}
              onDragOver={(e) => {
                e.preventDefault()
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                if (draggingId == null) return
                if (draggingId === game.id) return
                setHoveredId(game.id)
                handleReorder(draggingId, game.id)
              }}
              onDragLeave={() => {
                setHoveredId((prev) => (prev === game.id ? null : prev))
              }}
              onDrop={(e) => {
                e.preventDefault()
                const data = e.dataTransfer.getData('text/plain')
                const from = draggingId ?? Number(data)
                if (!from || !Number.isFinite(from)) return
                setDraggingId(null)
                setHoveredId(null)
              }}
            >
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-1 top-1 z-10 h-7 w-7 rounded-md bg-theme-secondary text-theme-text opacity-0 transition-opacity hover:bg-theme-error group-hover:opacity-100"
                onClick={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  await handleDeleteQuickAccess(game.id)
                }}
                aria-label={`Remove ${game.name} from Quick Access`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>

              <div
                draggable
                onDragStart={(e) => {
                  setDraggingId(game.id)
                  setHoveredId(null)
                  try {
                    e.dataTransfer.setData('text/plain', String(game.id))
                  } catch {
                    // ignore
                  }
                  e.dataTransfer.effectAllowed = 'move'
                  setTransparentDragImage(e.dataTransfer)
                }}
                onDragEnd={() => {
                  setDraggingId(null)
                  setHoveredId(null)
                }}
                className="absolute left-1 top-1 cursor-grab rounded bg-theme-card/50 p-0.5"
                aria-label="Drag to reorder"
                role="button"
                tabIndex={0}
              >
                <GripVertical className="h-4 w-4 text-theme-muted" aria-hidden />
              </div>

              <div className="select-none">
                <ExecutableIcon relPath={game.exeIconRelPath} alt={game.name} />
              </div>
            </div>
          )
        })}

        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className={[
            'flex items-center justify-center rounded-xl',
            'border-2 border-dashed border-theme-border bg-theme-sidebar/40',
            'transition-colors hover:border-theme-secondary hover:bg-theme-sidebar',
            quickAccessGames.length === 0 ? 'h-12 w-[680px] rounded-xl' : 'h-16 w-16',
          ].join(' ')}
          aria-label="Add more quick access"
          disabled={disabled}
        >
          {quickAccessGames.length === 0 ? (
            <div className="flex w-full items-center justify-center gap-2">
              <Plus className="h-5 w-5 text-theme-accent" aria-hidden />
              <div className="text-sm font-semibold tracking-wide text-theme-muted">Select Apps</div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1">
              <Plus className="h-5 w-5 text-theme-accent" aria-hidden />
              <div className="text-[11px] font-semibold tracking-wide text-theme-muted">Add</div>
            </div>
          )}
        </Button>
      </div>

      {quickAccessGames.length > 0 ? (
        <div className={`text-center text-xs text-theme-muted ${embedded ? 'mt-3' : 'mt-4'}`}>
          Drag the grip icon to change order.
        </div>
      ) : null}

      <AddQuickAccessDialog
        open={addOpen}
        onOpenChange={(next) => setAddOpen(next)}
        games={games}
        quickAccessIds={quickAccessIds}
        onAdd={(gameId) => void handleAdd(gameId)}
      />
    </>
  )

  if (embedded) {
    return <div className="w-full">{inner}</div>
  }

  return (
    <div className="w-full p-6">
      {inner}
    </div>
  )
}
