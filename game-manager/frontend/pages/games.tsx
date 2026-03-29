import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import { AddGameDialog } from '@/components/add-game-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Game } from '@/lib/game'
import { hasWailsApp, loadGames, saveGames } from '@/lib/games-storage'
import { loadClients, type Client } from '@/lib/clients-storage'
import { yieldForNativeFileDialog } from '@/lib/yield-for-native-file-dialog'
import { GetDataDir, PickExecutableFile, ReadImageFileDataURL } from '@/wailsjs/wailsjs/go/main/App'
import { ArrowUpDown, ChevronDown, Gamepad2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type SortKey = 'name' | 'category' | 'group' | 'tags' | 'platform' | 'status'
type SortDirection = 'asc' | 'desc'

const exeIconDataUrlCache = new Map<string, string>()
let cachedDataDir: string | null = null
let cachedDataDirPromise: Promise<string> | null = null

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

const metaPillClass =
  'inline-flex max-w-full items-center gap-1 rounded-md border border-theme-border bg-theme-card px-2 py-1 text-xs text-theme-text'

function parseCategoryParts(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function relPathToAbsolute(dataDir: string, relPath: string): string {
  // `relPath` comes from Go via `filepath.ToSlash`, so it uses `/` separators.
  // `ReadImageFileDataURL` expects an absolute path, and Go's `filepath.Clean`
  // can handle mixed separators on Windows.
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

      // Outside Wails we fall back to the old behavior.
      // In Wails we convert the on-disk PNG to a `data:` URL for reliable rendering.
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
      <Gamepad2 className="h-5 w-5 text-theme-accent" aria-hidden />
    </div>
  )
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [addGameOpen, setAddGameOpen] = useState(false)
  const [editGameOpen, setEditGameOpen] = useState(false)
  const [editingGame, setEditingGame] = useState<Game | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [allowedClientsExpanded, setAllowedClientsExpanded] = useState<Record<number, boolean>>({})
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogIds, setDeleteDialogIds] = useState<number[] | null>(null)

  const refreshGames = () => {
    void loadGames().then((data) => setGames(data))
  }

  const refreshClients = () => {
    void loadClients().then((data) => setClients(data))
  }

  useEffect(() => {
    void loadGames().then((data) => {
      setGames(data)
      setHydrated(true)
    })
    refreshClients()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void saveGames(games)
  }, [games, hydrated])

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return games

    return games.filter((game) => {
      const tagsJoined = game.tags.join(' ').toLowerCase()
      const clientsJoined = game.allowedClientIps.join(' ').toLowerCase()
      return (
        game.name.toLowerCase().includes(q) ||
        String(game.category).toLowerCase().includes(q) ||
        tagsJoined.includes(q) ||
        String(game.status).toLowerCase().includes(q) ||
        clientsJoined.includes(q) ||
        String(game.id).includes(q)
      )
    })
  }, [games, searchQuery])

  const sortedGames = useMemo(() => {
    const valueForSort = (game: Game, key: SortKey) => {
      if (key === 'tags') return game.tags.join(', ')
      return game[key]
    }

    const sorted = [...filteredGames].sort((a, b) => {
      const left = valueForSort(a, sortKey)
      const right = valueForSort(b, sortKey)
      return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })
    })

    return sortDirection === 'asc' ? sorted : sorted.reverse()
  }, [filteredGames, sortDirection, sortKey])

  const visibleGameIds = useMemo(() => sortedGames.map((g) => g.id), [sortedGames])

  const allRowsSelected =
    sortedGames.length > 0 && sortedGames.every((g) => selectedIds.includes(g.id))

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  const setSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleGameIds])))
    } else {
      setSelectedIds((prev) => prev.filter((id) => !visibleGameIds.includes(id)))
    }
  }

  const setRowSelected = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id)
    )
  }

  const handleEdit = (game: Game) => {
    setEditingGame(game)
    setEditGameOpen(true)
  }

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return
    setDeleteDialogIds(ids)
  }

  const confirmDeleteGames = () => {
    if (!deleteDialogIds || deleteDialogIds.length === 0) return
    const toRemove = new Set(deleteDialogIds)
    setGames((prev) => prev.filter((item) => !toRemove.has(item.id)))
    setSelectedIds((prev) => prev.filter((id) => !toRemove.has(id)))
    setDeleteDialogIds(null)
  }

  const selectedDeletableIds = useMemo(
    () => selectedIds.filter((id) => games.some((g) => g.id === id)),
    [games, selectedIds]
  )

  const clientNameByIp = useMemo(() => {
    const map = new Map<string, string>()
    for (const client of clients) {
      map.set(client.ip.trim().toLowerCase(), client.name)
    }
    return map
  }, [clients])

  const clientLabel = (ip: string) => {
    const name = clientNameByIp.get(ip.trim().toLowerCase())
    return name ? `${name}` : ''
  }

  const clientType = (ip: string) => {
    const type = clients.find((c) => c.ip.trim().toLowerCase() === ip.trim().toLowerCase())?.type || 'unknown'
    return type ? `${type}` : ''
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Games</title>
      </Head>
      <AddGameDialog
        open={addGameOpen}
        onOpenChange={setAddGameOpen}
        onSaved={() => {
          refreshGames()
          refreshClients()
        }}
      />
      <AddGameDialog
        open={editGameOpen}
        mode="edit"
        initialGame={editingGame}
        onOpenChange={(next) => {
          setEditGameOpen(next)
          if (!next) setEditingGame(undefined)
        }}
        onSaved={() => {
          refreshGames()
          refreshClients()
        }}
      />
      <div className="wails-no-drag ml-auto flex w-full items-center gap-2 mb-4">
        <div className="flex w-[360px] items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search games"
            className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
            aria-label="Search games"
          />
          <Button
            type="button"
            variant="secondary"
            className="bg-theme-secondary hover:bg-theme-secondary-hover"
            onClick={() => setSearchQuery('')}
            disabled={!searchQuery}
            aria-label="Clear search"
          >
            {searchQuery ? <X className="text-theme-text" /> : <Search className="text-theme-text" />}
          </Button>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {selectedDeletableIds.length > 0 && (
            <Button
              variant="secondary"
              className="bg-theme-secondary text-theme-text hover:bg-theme-error/85"
              onClick={() => openDeleteDialog(selectedDeletableIds)}
            >
              <Trash2 className="h-4 w-4" />
              Delete selected ({selectedDeletableIds.length})
            </Button>
          )}
          <Button
            className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
            onClick={() => setAddGameOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Game
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 rounded-xl bg-theme-card">
        <div className="h-full overflow-auto rounded-lg border border-theme-border bg-theme-app">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 w-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  <Checkbox
                    checked={allRowsSelected}
                    onCheckedChange={(value) => setSelectAll(value === true)}
                    aria-label="Select all games"
                  />
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Icon
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-theme-text"
                  >
                    Name <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggleSort('category')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-theme-text"
                  >
                    Category <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                {/* <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggleSort('group')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-theme-text"
                  >
                    Group <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead> */}
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggleSort('tags')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-theme-text"
                  >
                    Tags <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Allowed Clients
                </TableHead>
                {/* <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggleSort('platform')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-theme-text"
                  >
                    Platform <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead> */}
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-right text-theme-secondary-text backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggleSort('status')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-theme-text"
                  >
                    Status <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-right text-theme-secondary-text backdrop-blur">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedGames.map((game) => {
                const categoryParts = parseCategoryParts(game.category)
                return (
                <TableRow key={game.id} className="hover:bg-theme-card">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(game.id)}
                      onCheckedChange={(value) => setRowSelected(game.id, value === true)}
                      aria-label={`Select ${game.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-theme-text">
                    <ExecutableIcon relPath={game.exeIconRelPath} alt={game.name} />
                  </TableCell>
                  <TableCell className="font-medium text-theme-text">{game.name}</TableCell>
                  <TableCell className="text-theme-text">
                    {categoryParts.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {categoryParts.map((c) => (
                          <span key={c} className={metaPillClass}>
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-theme-muted">—</span>
                    )}
                  </TableCell>
                  {/* <TableCell className="text-theme-text">{game.group}</TableCell> */}
                  <TableCell className="text-theme-text">
                    {game.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {game.tags.map((t) => (
                          <span key={t} className={metaPillClass}>
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-theme-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-theme-text">
                    {game.allowedClientIps.length === 0 ? (
                      <span className={cn(metaPillClass, 'text-theme-muted')}>All clients</span>
                    ) : game.allowedClientIps.length <= 2 ? (
                      <div className="flex flex-col gap-1.5">
                        {game.allowedClientIps.map((ip) => (
                          <div key={ip} className={cn(metaPillClass, 'min-w-0')}>
                            <span className="min-w-0 truncate font-medium">{clientLabel(ip)}</span>
                            <span className="shrink-0 font-mono text-[10px] text-theme-muted">({ip})</span>
                            <span className="shrink-0 text-[10px] uppercase text-theme-primary">{clientType(ip)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Collapsible
                        open={!!allowedClientsExpanded[game.id]}
                        onOpenChange={(next) =>
                          setAllowedClientsExpanded((prev) => ({
                            ...prev,
                            [game.id]: next,
                          }))
                        }
                      >
                        <div className="flex flex-col gap-1.5">
                          {game.allowedClientIps.slice(0, 2).map((ip) => (
                            <div key={ip} className={cn(metaPillClass, 'min-w-0')}>
                              <span className="min-w-0 truncate font-medium">{clientLabel(ip)}</span>
                              <span className="shrink-0 font-mono text-[10px] text-theme-muted">({ip})</span>
                              <span className="shrink-0 text-[10px] uppercase text-theme-primary">{clientType(ip)}</span>
                            </div>
                          ))}
                          <CollapsibleContent className="flex flex-col gap-1.5">
                            {game.allowedClientIps.slice(2).map((ip) => (
                              <div key={ip} className={cn(metaPillClass, 'min-w-0')}>
                                <span className="min-w-0 truncate font-medium">{clientLabel(ip)}</span>
                                <span className="shrink-0 font-mono text-[10px] text-theme-muted">({ip})</span>
                                <span className="shrink-0 text-[10px] uppercase text-theme-primary">{clientType(ip)}</span>
                              </div>
                            ))}
                          </CollapsibleContent>
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto justify-start px-0 py-0 text-xs text-theme-muted hover:bg-transparent hover:text-theme-text"
                            >
                              <ChevronDown className={cn('h-3.5 w-3.5', allowedClientsExpanded[game.id] && 'rotate-180')} />
                              {allowedClientsExpanded[game.id] ? 'Showing all' : 'Show all'} ({game.allowedClientIps.length})
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </Collapsible>
                    )}
                  </TableCell>
                  {/* <TableCell className="text-theme-text">{game.platform}</TableCell> */}
                  <TableCell className="text-right text-theme-text">
                    <div className="flex justify-end">
                      <Badge
                        className={cn('shrink-0',
                          game.status === 'Installed'
                            ? 'border-theme-success/45 bg-theme-success/15 text-theme-success'
                            : 'border-theme-warning/45 bg-theme-warning/15 text-theme-warning',
                        )}
                      >
                        {game.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => handleEdit(game)}
                        aria-label={`Edit ${game.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-error"
                        onClick={() => openDeleteDialog([game.id])}
                        aria-label={`Delete ${game.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={deleteDialogIds !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogIds(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialogIds && deleteDialogIds.length === 1 ? 'Delete this game?' : 'Delete games?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {deleteDialogIds && deleteDialogIds.length === 1
                ? (() => {
                  const g = games.find((x) => x.id === deleteDialogIds[0])
                  return g
                    ? `"${g.name}" will be removed from the library. This cannot be undone.`
                    : 'This game will be removed. This cannot be undone.'
                })()
                : deleteDialogIds
                  ? `${deleteDialogIds.length} games will be removed from the library. This cannot be undone.`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-theme-error text-theme-text hover:bg-theme-error/90"
              onClick={(e) => {
                e.preventDefault()
                confirmDeleteGames()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
