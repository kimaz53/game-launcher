import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

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
import { hasWailsApp } from '@/lib/games-storage'
import { yieldForNativeFileDialog } from '@/lib/yield-for-native-file-dialog'
import { ImportCategoryIcon, PickImageFile, ReadImageFileDataURL, GetCoverDataURL } from '@/wailsjs/wailsjs/go/main/App'
import type { CategoryDefinition } from '@/lib/categories-storage'

type AddCategoryDialogProps = {
  open: boolean
  mode?: 'add' | 'edit'
  initialCategory?: CategoryDefinition
  onOpenChange: (open: boolean) => void
  onSaved: (category: string, iconRelPath?: string, iconDataUrl?: string) => void
}

export function AddCategoryDialog({ open, mode = 'add', initialCategory, onOpenChange, onSaved }: AddCategoryDialogProps) {
  const formId = useId()
  const nameId = `${formId}-name`
  const iconFileInputRef = useRef<HTMLInputElement>(null)

  const [categoryName, setCategoryName] = useState('')
  const [iconRelPath, setIconRelPath] = useState('')
  const [iconDataUrl, setIconDataUrl] = useState('')

  useEffect(() => {
    if (!open) return

    if (mode === 'edit' && initialCategory) {
      setCategoryName(initialCategory.name)
      setIconRelPath(initialCategory.iconRelPath ?? '')

      if (initialCategory.iconDataUrl) {
        setIconDataUrl(initialCategory.iconDataUrl)
      } else if (initialCategory.iconRelPath && hasWailsApp()) {
        void GetCoverDataURL(initialCategory.iconRelPath).then((dataUrl) => {
          setIconDataUrl(dataUrl || '')
        })
      } else {
        setIconDataUrl('')
      }
    } else {
      setCategoryName('')
      setIconRelPath('')
      setIconDataUrl('')
    }
  }, [open, mode, initialCategory])

  const pickIcon = async () => {
    if (hasWailsApp()) {
      await yieldForNativeFileDialog()
      const picked = await PickImageFile()
      if (!picked) return

      const previewUrl = await ReadImageFileDataURL(picked)
      setIconDataUrl(previewUrl || '')

      // Persist icon into the app's portable `data/` folder.
      const relPath = await ImportCategoryIcon(picked)
      setIconRelPath(relPath || '')
      return
    }

    iconFileInputRef.current?.click()
  }

  const onIconPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      setIconDataUrl('')
      setIconRelPath('')
      return
    }

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })

    setIconDataUrl(dataUrl || '')
    setIconRelPath('')
  }

  const handleSave = () => {
    const next = categoryName.trim()
    if (!next) return

    const rel = iconRelPath.trim()
    const dataUrl = iconDataUrl.trim() || undefined
    // If we already imported to the app's `data/` folder, avoid persisting a huge data URL.
    onSaved(next, rel ? rel : undefined, rel ? undefined : dataUrl)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <DialogContent className="font-display max-w-xl border-theme-border bg-theme-sidebar p-6 text-theme-text">
        <DialogHeader>
          <DialogTitle className="font-display text-theme-text">{mode === 'edit' ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription className="font-display text-theme-muted">
            Optional: choose an icon image for this category.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={iconFileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.ico"
          aria-hidden
          onChange={(e) => void onIconPicked(e)}
        />

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-theme-border bg-theme-card">
              {iconDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconDataUrl} alt="Category icon preview" className="h-10 w-10 rounded-md" />
              ) : (
                <span className="font-display text-sm font-semibold text-theme-muted">?</span>
              )}
            </div>
            <div className="flex flex-col">
              <Button
                type="button"
                className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
                onClick={() => void pickIcon()}
              >
                Choose Icon
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={nameId} className="font-display text-sm text-theme-muted">
              Category Name
            </label>
            <Input
              id={nameId}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g. Online Games"
              autoFocus
              className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="font-display border-theme-border bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
            onClick={() => handleSave()}
            disabled={!categoryName.trim()}
          >
            {mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

