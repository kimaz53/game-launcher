import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { ArrowUpDown, Pencil, X, Trash2, Plus, Search, SaveIcon } from 'lucide-react'

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))
}

export default function TagsPage() {
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [addTagOpen, setAddTagOpen] = useState(false)
  const [editTag, setEditTag] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])

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

  const allRowsSelected = sortedTags.length > 0 && selectedTags.length === sortedTags.length

  const setSelectAll = (checked: boolean) => {
    if (checked) setSelectedTags(sortedTags)
    else setSelectedTags([])
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

  const removeTagFromGames = async (value: string) => {
    const games = await loadGames()
    const updated = games.map((g) => ({
      ...g,
      tags: g.tags.filter((t) => t !== value),
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

  const handleDelete = async (value: string) => {
    const ok = window.confirm(`Delete tag "${value}" from list and remove it from games?`)
    if (!ok) return

    const nextTags = tags.filter((t) => t !== value)
    setTags(nextTags)
    await removeTagFromGames(value)
    await saveTags(nextTags)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Tags</title>
      </Head>
      <div className="wails-no-drag ml-auto flex w-full items-center gap-2 mb-4">
        <div className="flex w-[360px] items-center gap-2">
          <Input
            placeholder="Search"
            className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
          />
          <Button variant="secondary" className="bg-theme-secondary hover:bg-theme-secondary-hover">
            <Search className="text-theme-text" />
          </Button>
        </div>
        <div className="flex gap-2 ml-auto">
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
              {sortedTags.map((tag) => (
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
                        onClick={() => handleDelete(tag)}
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
    </div >
  )
}


