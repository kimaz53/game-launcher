import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'

import { AddCategoryDialog } from '@/components/add-category-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasWailsApp, loadGames, saveGames } from '@/lib/games-storage'
import { loadCategories, saveCategories, type CategoryDefinition } from '@/lib/categories-storage'
import { GetDataDir, ReadImageFileDataURL } from '@/wailsjs/wailsjs/go/main/App'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowUpDown, Pencil, X, Trash2, Plus, Search } from 'lucide-react'

function parseMulti(csv: string | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function joinMulti(values: string[]): string {
  return values.join(', ')
}

function hashToHue(input: string): number {
  let acc = 0
  for (let i = 0; i < input.length; i++) acc = (acc * 31 + input.charCodeAt(i)) >>> 0
  return acc % 360
}

function CategoryGlyph({ category }: { category: string }) {
  const trimmed = category.trim()
  const letter = trimmed ? trimmed[0].toUpperCase() : '?'
  const hue = hashToHue(trimmed)

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-md border border-theme-border text-theme-text"
      style={{
        backgroundColor: `hsl(${hue} 70% 45% / 0.25)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 45% / 0.25)`,
      }}
      aria-hidden
    >
      <span className="text-sm font-semibold" style={{ color: `hsl(${hue} 75% 48%)` }}>
        {letter}
      </span>
    </div>
  )
}

const categoryIconDataUrlCache = new Map<string, string>()
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

function relPathToAbsolute(dataDir: string, relPath: string): string {
  const cleanDataDir = dataDir.replace(/[\\\/]+$/, '')
  const cleanRel = relPath.replace(/^[\\\/]+/, '')
  return `${cleanDataDir}/${cleanRel}`
}

function CategoryIcon({ category }: { category: CategoryDefinition }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (category.iconDataUrl) {
        setSrc(category.iconDataUrl)
        return
      }

      const relPath = category.iconRelPath
      if (!relPath) {
        setSrc(null)
        return
      }

      const cached = categoryIconDataUrlCache.get(relPath)
      if (cached) {
        setSrc(cached)
        return
      }

      if (!hasWailsApp()) {
        setSrc(null)
        return
      }

      const dataDir = await getDataDirCached()
      if (!dataDir) return

      const absolutePath = relPathToAbsolute(dataDir, relPath)
      const dataUrl = await ReadImageFileDataURL(absolutePath)
      if (cancelled) return

      const final = dataUrl || ''
      if (final) categoryIconDataUrlCache.set(relPath, final)
      setSrc(final || null)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [category.iconRelPath, category.iconDataUrl])

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`${category.name} icon`} className="h-10 w-10 rounded-md" />
  }

  return <CategoryGlyph category={category.name} />
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryDefinition[]>([])
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<CategoryDefinition | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      const stored = await loadCategories()
      const games = await loadGames()
      const usedNames = Array.from(
        new Set(games.flatMap((g) => parseMulti(g.category)))
      )

      // Merge stored category definitions (icons, etc.) with categories that are currently used by games.
      // Stored definitions take precedence over game-derived rows.
      const mergedByName = new Map<string, CategoryDefinition>()
      for (const c of stored) mergedByName.set(c.name, c)
      for (const name of usedNames) {
        if (!mergedByName.has(name)) mergedByName.set(name, { name })
      }

      setCategories(Array.from(mergedByName.values()))
    }
    void load()
  }, [])

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [categories])

  const allRowsSelected = sortedCategories.length > 0 && selectedCategories.length === sortedCategories.length

  const setSelectAll = (checked: boolean) => {
    if (checked) setSelectedCategories(sortedCategories.map((c) => c.name))
    else setSelectedCategories([])
  }

  const setCategorySelected = (category: string, checked: boolean) => {
    setSelectedCategories((prev) => {
      if (checked) return prev.includes(category) ? prev : [...prev, category]
      return prev.filter((item) => item !== category)
    })
  }

  const upsertCategoryInGames = async (oldValue: string, nextValue: string) => {
    const games = await loadGames()
    const updated = games.map((g) => {
      const parts = parseMulti(g.category)
      const nextParts = parts.map((p) => (p === oldValue ? nextValue : p))
      const deduped = Array.from(new Set(nextParts))
      return { ...g, category: joinMulti(deduped) }
    })
    await saveGames(updated)
  }

  const removeCategoryFromGames = async (value: string) => {
    const games = await loadGames()
    const updated = games.map((g) => {
      const parts = parseMulti(g.category).filter((p) => p !== value)
      return { ...g, category: joinMulti(parts) }
    })
    await saveGames(updated)
  }

  const handleSaveCategory = async (
    nextCategory: string,
    iconRelPath?: string,
    iconDataUrl?: string
  ) => {
    const trimmed = nextCategory.trim()
    if (!trimmed) return

    if (editCategory) {
      if (trimmed !== editCategory.name && categories.some((c) => c.name === trimmed)) return

      const nextCategories = categories.map((c) =>
        c.name === editCategory.name
          ? { ...c, name: trimmed, iconRelPath: iconRelPath || c.iconRelPath, iconDataUrl: iconDataUrl || c.iconDataUrl }
          : c
      )
      setCategories(nextCategories)

      if (trimmed !== editCategory.name) {
        await upsertCategoryInGames(editCategory.name, trimmed)
      }

      await saveCategories(nextCategories)
      setEditCategory(null)
      return
    }

    if (categories.some((c) => c.name === trimmed)) return

    const nextCategories: CategoryDefinition[] = [
      ...categories,
      {
        name: trimmed,
        iconRelPath: iconRelPath?.trim() ? iconRelPath : undefined,
        iconDataUrl: iconDataUrl?.trim() ? iconDataUrl : undefined,
      },
    ]

    setCategories(nextCategories)
    await saveCategories(nextCategories)
  }

  const handleDelete = async (value: string) => {
    const ok = window.confirm(`Delete category "${value}" from list and remove it from games?`)
    if (!ok) return

    const nextCategories = categories.filter((c) => c.name !== value)
    setCategories(nextCategories)
    await removeCategoryFromGames(value)
    await saveCategories(nextCategories)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Categories</title>
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
          <Button
            type="button"
            className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
            onClick={() => {
              setEditCategory(null)
              setAddCategoryOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Add Category
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
                    aria-label="Select all categories"
                  />
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Icon
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Name
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-right text-theme-secondary-text backdrop-blur">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCategories.map((category) => (
                <TableRow key={category.name} className="hover:bg-theme-card">
                  <TableCell>
                    <Checkbox
                      checked={selectedCategories.includes(category.name)}
                      onCheckedChange={(value) => setCategorySelected(category.name, value === true)}
                      aria-label={`Select ${category.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <CategoryIcon category={category} />
                  </TableCell>
                  <TableCell className="font-medium text-theme-text">{category.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => {
                          setEditCategory(category)
                          setAddCategoryOpen(true)
                        }}
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-error"
                        onClick={() => handleDelete(category.name)}
                        aria-label={`Delete ${category.name}`}
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

      <AddCategoryDialog
        open={addCategoryOpen}
        mode={editCategory ? 'edit' : 'add'}
        initialCategory={editCategory ?? undefined}
        onOpenChange={(next) => {
          if (!next) {
            setAddCategoryOpen(false)
            setEditCategory(null)
          } else {
            setAddCategoryOpen(true)
          }
        }}
        onSaved={(category, iconRelPath, iconDataUrl) =>
          void handleSaveCategory(category, iconRelPath, iconDataUrl)
        }
      />
    </div >
  )
}

