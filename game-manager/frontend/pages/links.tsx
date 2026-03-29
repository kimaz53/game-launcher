import Head from 'next/head'
import { useCallback, useEffect, useMemo, useState } from 'react'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { hasWailsApp } from '@/lib/games-storage'
import { yieldForNativeFileDialog } from '@/lib/yield-for-native-file-dialog'
import { GetCoverDataURL, ImportLinkIcon, LoadLinksJSON, PickImageFile, SaveLinksJSON } from '@/wailsjs/wailsjs/go/main/App'
import { ExternalLink, ImageIcon, Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type HeaderLink = {
  id: number
  label: string
  url: string
  /** Relative path under data (e.g. icons/link-1.png). */
  icon?: string
}

function parseLinksJson(json: string): HeaderLink[] {
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    const seen = new Set<number>()
    const out: HeaderLink[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const id = Number(o.id)
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      const url = typeof o.url === 'string' ? o.url.trim() : ''
      const iconRaw = typeof o.icon === 'string' ? o.icon.trim() : ''
      if (!Number.isFinite(id) || id <= 0 || seen.has(id) || !label || !url) continue
      seen.add(id)
      const row: HeaderLink = { id, label, url }
      if (iconRaw) row.icon = iconRaw
      out.push(row)
    }
    return out.sort((a, b) => a.id - b.id)
  } catch {
    return []
  }
}

function nextId(links: HeaderLink[]): number {
  let m = 0
  for (const l of links) m = Math.max(m, l.id)
  return m + 1
}

function LinkIconThumb({ relPath }: { relPath?: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!relPath?.trim() || !hasWailsApp()) {
      setSrc(null)
      return
    }
    let cancelled = false
    void GetCoverDataURL(relPath.trim()).then((u) => {
      if (!cancelled) setSrc(u || null)
    })
    return () => {
      cancelled = true
    }
  }, [relPath])

  if (!src) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-theme-border bg-theme-secondary/50">
        <ImageIcon className="h-4 w-4 text-theme-muted" aria-hidden />
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-9 w-9 rounded border border-theme-border object-contain" />
}

export default function LinksPage() {
  const [links, setLinks] = useState<HeaderLink[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<HeaderLink | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formIcon, setFormIcon] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const canPersist = hydrated && hasWailsApp()

  const load = useCallback(async () => {
    if (!hasWailsApp()) {
      setLinks([])
      setHydrated(true)
      return
    }
    try {
      const j = await LoadLinksJSON()
      setLinks(parseLinksJson(j))
      setSaveError(null)
    } catch {
      setLinks([])
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persist = async (next: HeaderLink[]) => {
    setLinks(next)
    if (!canPersist) return
    try {
      await SaveLinksJSON(JSON.stringify(next))
      const j = await LoadLinksJSON()
      setLinks(parseLinksJson(j))
      setSaveError(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save links.')
      await load()
    }
  }

  const buildLinkPayload = (id: number): HeaderLink => {
    const label = formLabel.trim()
    const url = formUrl.trim()
    const link: HeaderLink = { id, label, url }
    const icon = formIcon.trim()
    if (icon) link.icon = icon
    return link
  }

  const openAdd = () => {
    setEditing(null)
    setFormLabel('')
    setFormUrl('https://')
    setFormIcon('')
    setDialogOpen(true)
  }

  const openEdit = (link: HeaderLink) => {
    setEditing(link)
    setFormLabel(link.label)
    setFormUrl(link.url)
    setFormIcon(link.icon ?? '')
    setDialogOpen(true)
  }

  const handlePickIcon = async () => {
    if (!hasWailsApp()) return
    const linkId = editing?.id ?? nextId(links)
    await yieldForNativeFileDialog()
    const picked = await PickImageFile()
    if (!picked) return
    try {
      const rel = await ImportLinkIcon(picked, linkId)
      if (rel?.trim()) setFormIcon(rel.trim())
    } catch {
      setSaveError('Could not import icon image.')
    }
  }

  const handleSaveDialog = async () => {
    setSaveError(null)
    const label = formLabel.trim()
    const url = formUrl.trim()
    if (!label || !url) return
    const lower = url.toLowerCase()
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      setSaveError('URL must start with http:// or https://')
      return
    }

    let next: HeaderLink[]
    if (editing) {
      next = links.map((l) => (l.id === editing.id ? buildLinkPayload(editing.id) : l))
    } else {
      next = [...links, buildLinkPayload(nextId(links))]
    }
    setDialogOpen(false)
    setEditing(null)
    await persist(next)
  }

  const handleDelete = async (id: number) => {
    await persist(links.filter((l) => l.id !== id))
  }

  const sorted = useMemo(() => [...links].sort((a, b) => a.id - b.id), [links])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Links</title>
      </Head>

      <div className="min-h-0 flex-1 rounded-xl bg-theme-card">
        <div className="flex h-full flex-col gap-4 overflow-auto rounded-lg border border-theme-border bg-theme-app p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-theme-text">Header links</h1>
              <p className="mt-1 max-w-xl text-sm text-theme-muted">
                These appear in the game client title bar in a row next to the window buttons. Optional icons show to the left of
                the label; one click opens the URL in the default browser.
              </p>
            </div>
            <Button
              type="button"
              className="gap-2 !bg-theme-primary !text-theme-text"
              onClick={openAdd}
              disabled={!canPersist}
            >
              <Plus className="h-4 w-4" />
              Add link
            </Button>
          </div>

          {!canPersist && hydrated ? (
            <p className="rounded-md border border-dashed border-theme-border bg-theme-sidebar/50 px-3 py-2 text-sm text-theme-muted">
              Run inside Game Manager to edit links (Wails bindings are not available in the browser preview).
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-theme-border">
            <Table>
              <TableHeader>
                <TableRow className="border-theme-border hover:bg-transparent">
                  <TableHead className="w-[72px] text-theme-muted">Icon</TableHead>
                  <TableHead className="text-theme-muted">Label</TableHead>
                  <TableHead className="text-theme-muted">URL</TableHead>
                  <TableHead className="w-[120px] text-right text-theme-muted">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow className="border-theme-border hover:bg-transparent">
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-theme-muted">
                      No links yet. Add a label and URL (https://…); optionally add an icon image.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((link) => (
                    <TableRow key={link.id} className="border-theme-border">
                      <TableCell>
                        <LinkIconThumb relPath={link.icon} />
                      </TableCell>
                      <TableCell className="font-medium text-theme-text">{link.label}</TableCell>
                      <TableCell>
                        <span className="inline-flex max-w-md items-center gap-1 truncate text-sm text-theme-accent" title={link.url}>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          {link.url}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                          aria-label={`Edit ${link.label}`}
                          disabled={!canPersist}
                          onClick={() => openEdit(link)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="bg-theme-secondary text-theme-text hover:bg-theme-error"
                          aria-label={`Remove ${link.label}`}
                          disabled={!canPersist}
                          onClick={() => void handleDelete(link.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-theme-border bg-theme-sidebar text-theme-text sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit link' : 'Add link'}</DialogTitle>
            <DialogDescription className="text-theme-muted">
              Use a full URL including <code className="text-theme-accent">https://</code>. Optional icon appears left of the label
              on the client.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="grid gap-1.5 text-sm">
              <span className="text-theme-muted">Label</span>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Discord"
                className="border-theme-border bg-theme-app text-theme-text"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-theme-muted">URL</span>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com"
                className="border-theme-border bg-theme-app text-theme-text"
              />
            </label>

            {saveError ? (
              <p className="border-theme-error/40 bg-theme-error/10 text-sm text-theme-error">
                {saveError}
              </p>
            ) : null}

            <div className="grid gap-2">
              <span className="text-sm text-theme-muted">Icon (optional)</span>
              <div className="flex flex-row flex-wrap items-center gap-3">
                <LinkIconThumb relPath={formIcon} />
                <div className="flex flex-row flex-wrap gap-2">
                  <Button className='!bg-theme-primary !text-theme-text' type="button" variant="secondary" size="sm" disabled={!canPersist} onClick={() => void handlePickIcon()}>
                    Choose image…
                  </Button>
                  {formIcon ? (
                    <Button type="button" variant="ghost" size="sm" className="gap-1 text-theme-muted" onClick={() => setFormIcon('')}>
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button className='text-theme-text hover:!bg-theme-secondary hover:!text-theme-text' type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveDialog()}
              disabled={!formLabel.trim() || !formUrl.trim()}
              className={cn(!formLabel.trim() || !formUrl.trim() ? 'opacity-50' : '',
                '!bg-theme-primary !text-theme-text'
              )}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
