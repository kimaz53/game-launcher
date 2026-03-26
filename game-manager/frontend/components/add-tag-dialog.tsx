import { useEffect, useId, useState } from 'react'

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

type AddTagDialogProps = {
  open: boolean
  mode?: 'add' | 'edit'
  initialTag?: string
  onOpenChange: (open: boolean) => void
  onSaved: (tag: string) => void
}

export function AddTagDialog({
  open,
  mode = 'add',
  initialTag,
  onOpenChange,
  onSaved,
}: AddTagDialogProps) {
  const formId = useId()
  const tagId = `${formId}-tag`

  const [tagValue, setTagValue] = useState('')

  useEffect(() => {
    if (!open) return
    setTagValue(mode === 'edit' && initialTag ? initialTag : '')
  }, [open, mode, initialTag])

  const handleSave = () => {
    const next = tagValue.trim()
    if (!next) return
    onSaved(next)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-md border-theme-border bg-theme-sidebar p-6 text-theme-text">
        <DialogHeader>
          <DialogTitle className="text-theme-text">
            {mode === 'edit' ? 'Edit Tag' : 'Add Tag'}
          </DialogTitle>
          <DialogDescription className="text-theme-muted">
            Tag names are used to categorize games.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor={tagId} className="text-sm text-theme-muted">
            Tag Name
          </label>
          <Input
            id={tagId}
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
            placeholder="e.g. Action"
            autoFocus
            className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
          />
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
            onClick={() => handleSave()}
            disabled={!tagValue.trim()}
          >
            {mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
