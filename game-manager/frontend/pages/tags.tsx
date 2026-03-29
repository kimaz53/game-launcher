import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
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
import { AddTagDialog } from '@/components/add-tag-dialog'
import { loadGames, saveGames } from '@/lib/games-storage'
import { loadTags, saveTags } from '@/lib/tags-storage'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Pencil, Trash2, Plus, Search, X } from 'lucide-react'

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))
}

export default function TagsPage() {
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [addTagOpen, setAddTagOpen] = useState(false)
  const [editTag, setEditTag] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogTags, setDeleteDialogTags] = useState<string[] | null>(null)

  useEffect(() => {
    const load = async () => {
      const stored = await loadTags()
      const games = await loadGames()
      const used = games.flatMap((g) => g.tags)
      setTags(uniq([...stored, ...used]))
    }
    void load()
  }, [])

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [tags])

  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sortedTags
    return sortedTags.filter((t) => t.toLowerCase().includes(q))
  }, [sortedTags, searchQuery])

  const allRowsSelected =
    filteredTags.length > 0 && filteredTags.every((t) => selectedTags.includes(t))

  const setSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTags((prev) => Array.from(new Set([...prev, ...filteredTags])))
    } else {
      setSelectedTags((prev) => prev.filter((t) => !filteredTags.includes(t)))
    }
  }

  const setTagSelected = (tag: string, checked: boolean) => {
    setSelectedTags((prev) => {
      if (checked) return prev.includes(tag) ? prev : [...prev, tag]
      return prev.filter((item) => item !== tag)
    })
  }

  const upsertTagInGames = async (oldValue: string, nextValue: string) => {
    const games = await loadGames()
    const updated = games.map((g) => {
      const next = g.tags.map((t) => (t === oldValue ? nextValue : t))
      return { ...g, tags: uniq(next) }
    })
    await saveGames(updated)
  }

  const removeTagsFromGames = async (values: string[]) => {
    if (values.length === 0) return
    const toRemove = new Set(values)
    const games = await loadGames()
    const updated = games.map((g) => ({
      ...g,
      tags: g.tags.filter((t) => !toRemove.has(t)),
    }))
    await saveGames(updated)
  }

  const handleAdd = async () => {
    const next = newTag.trim()
    if (!next) return
    if (tags.includes(next)) return

    const nextTags = uniq([...tags, next])
    setTags(nextTags)
    setNewTag('')
    await saveTags(nextTags)
  }

  const handleTagSaved = async (newValue: string) => {
    const next = newValue.trim()
    if (!next) return

    if (editTag) {
      if (next === editTag) {
        setEditTag(null)
        setAddTagOpen(false)
        return
      }
      if (tags.includes(next)) return

      const nextTags = tags.map((t) => (t === editTag ? next : t))
      setTags(nextTags)
      setEditTag(null)
      setAddTagOpen(false)

      await upsertTagInGames(editTag, next)
      await saveTags(nextTags)
      return
    }

    if (tags.includes(next)) return

    const nextTags = uniq([...tags, next])
    setTags(nextTags)
    setAddTagOpen(false)
    await saveTags(nextTags)
  }

  const openDeleteDialog = (toDelete: string[]) => {
    if (toDelete.length === 0) return
    setDeleteDialogTags(toDelete)
  }

  const confirmDeleteTags = async () => {
    if (!deleteDialogTags || deleteDialogTags.length === 0) return
    const toRemove = new Set(deleteDialogTags)
    const nextTags = tags.filter((t) => !toRemove.has(t))
    setTags(nextTags)
    setSelectedTags((prev) => prev.filter((t) => !toRemove.has(t)))
    await removeTagsFromGames(deleteDialogTags)
    await saveTags(nextTags)
    setDeleteDialogTags(null)
  }

  const selectedDeletableTags = useMemo(
    () => selectedTags.filter((t) => tags.includes(t)),
    [tags, selectedTags]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Tags</title>
      </Head>
      <div className="wails-no-drag ml-auto flex w-full items-center gap-2 mb-4">
        <div className="flex w-[360px] items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tags"
            className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
            aria-label="Search tags"
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
        <div className="flex gap-2 ml-auto">
          {selectedDeletableTags.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="bg-theme-secondary text-theme-text hover:bg-theme-error/85"
              onClick={() => openDeleteDialog(selectedDeletableTags)}
            >
              <Trash2 className="h-4 w-4" />
              Delete selected ({selectedDeletableTags.length})
            </Button>
          )}
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="e.g. Action"
            className="border-theme-border bg-theme-sidebar text-theme-text placeholder:text-theme-muted"
          />
          <Button
            type="button"
            className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
            onClick={() => void handleAdd()}
            disabled={!newTag.trim()}
          >
            <Plus className="h-4 w-4" />
            Add Tag
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
                    aria-label="Select all tags"
                  />
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Name
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTags.map((tag) => (
                <TableRow key={tag} className="hover:bg-theme-card">
                  <TableCell>
                    <Checkbox
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={(value) => setTagSelected(tag, value === true)}
                      aria-label={`Select ${tag}`}
                    />
                  </TableCell>
                  <TableCell className="text-left">{tag}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => {
                          setEditTag(tag)
                          setAddTagOpen(true)
                        }}
                        aria-label={`Edit ${tag}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:!bg-theme-error group"
                        onClick={() => openDeleteDialog([tag])}
                        aria-label={`Delete ${tag}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <AddTagDialog
        open={addTagOpen}
        mode={editTag ? 'edit' : 'add'}
        initialTag={editTag ?? undefined}
        onOpenChange={(next) => {
          if (!next) {
            setAddTagOpen(false)
            setEditTag(null)
          } else {
            setAddTagOpen(true)
          }
        }}
        onSaved={(tag) => void handleTagSaved(tag)}
      />

      <AlertDialog
        open={deleteDialogTags !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogTags(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialogTags && deleteDialogTags.length === 1 ? 'Delete this tag?' : 'Delete tags?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {deleteDialogTags && deleteDialogTags.length === 1
                ? `"${deleteDialogTags[0]}" will be removed from the list and stripped from all games. This cannot be undone.`
                : deleteDialogTags
                  ? `${deleteDialogTags.length} tags will be removed from the list and stripped from all games. This cannot be undone.`
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
                void confirmDeleteTags()
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


