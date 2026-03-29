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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  loadClients,
  saveClients,
  migrateClientsFromSettingsIfNeeded,
  type Client,
  type ClientType,
} from '@/lib/clients-storage'
import { Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseIp(ip: string): number[] | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN
    const n = Number(p)
    if (!Number.isFinite(n) || n < 0 || n > 255) return NaN
    return n
  })
  if (nums.some((n) => Number.isNaN(n))) return null
  return nums
}

function ipToString(parts: number[]): string {
  return `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`
}

function incrementIp(parts: number[], step: number): number[] {
  // Treat as 32-bit number and add, wrapping within 0..2^32-1.
  const base =
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0)
  const next = (base + (step >>> 0)) >>> 0
  return [
    (next >>> 24) & 255,
    (next >>> 16) & 255,
    (next >>> 8) & 255,
    next & 255,
  ]
}

function uniqByIp(clients: Client[]): Client[] {
  const seen = new Set<string>()
  const out: Client[] = []
  for (const c of clients) {
    const ip = c.ip.trim()
    if (!ip) continue
    const key = ip.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...c, name: c.name.trim(), ip })
  }
  return out
}

function IpAddressInput({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const parsed = parseIp(value)
  const [p1, p2, p3, p4] = parsed ?? [0, 0, 0, 0]
  const [parts, setParts] = useState<string[]>([
    String(p1),
    String(p2),
    String(p3),
    String(p4),
  ])

  useEffect(() => {
    const again = parseIp(value)
    if (!again) return
    setParts(again.map((n) => String(n)))
  }, [value])

  const setPart = (idx: number, raw: string) => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 3)
    const nextParts = [...parts]
    nextParts[idx] = clean
    setParts(nextParts)

    const nums = nextParts.map((p) => (p === '' ? NaN : Number(p)))
    if (nums.some((n) => !Number.isFinite(n))) return
    const clamped = nums.map((n) => clampInt(n, 0, 255))
    onChange(ipToString(clamped))
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={parts[0]}
        onChange={(e) => setPart(0, e.target.value)}
        className="w-16 border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
        placeholder="192"
      />
      <span className="text-theme-muted">.</span>
      <Input
        inputMode="numeric"
        value={parts[1]}
        onChange={(e) => setPart(1, e.target.value)}
        className="w-16 border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
        placeholder="168"
      />
      <span className="text-theme-muted">.</span>
      <Input
        inputMode="numeric"
        value={parts[2]}
        onChange={(e) => setPart(2, e.target.value)}
        className="w-16 border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
        placeholder="1"
      />
      <span className="text-theme-muted">.</span>
      <Input
        inputMode="numeric"
        value={parts[3]}
        onChange={(e) => setPart(3, e.target.value)}
        className="w-16 border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
        placeholder="10"
      />
    </div>
  )
}

function clientTypeLabel(t: ClientType): string {
  return t === 'vip' ? 'VIP' : 'Non‑VIP'
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedIps, setSelectedIps] = useState<string[]>([])

  const [addOpen, setAddOpen] = useState(false)
  const [editingIp, setEditingIp] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const [newName, setNewName] = useState('')
  const [newIp, setNewIp] = useState('192.168.1.10')
  const [newType, setNewType] = useState<ClientType>('non-vip')

  const [bulkNamePrefix, setBulkNamePrefix] = useState('Client')
  const [bulkStartIp, setBulkStartIp] = useState('192.168.1.10')
  const [bulkCount, setBulkCount] = useState('5')
  const [bulkType, setBulkType] = useState<ClientType>('non-vip')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogIps, setDeleteDialogIps] = useState<string[] | null>(null)

  useEffect(() => {
    const run = async () => {
      const migrated = await migrateClientsFromSettingsIfNeeded()
      if (migrated.length > 0) {
        setClients(migrated)
        return
      }
      setClients(await loadClients())
    }
    void run()
  }, [])

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      if (byName !== 0) return byName
      return a.ip.localeCompare(b.ip, undefined, { sensitivity: 'base' })
    })
  }, [clients])

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sortedClients
    return sortedClients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.ip.toLowerCase().includes(q) ||
        clientTypeLabel(c.type).toLowerCase().includes(q)
    )
  }, [sortedClients, searchQuery])

  const visibleIps = useMemo(() => filteredClients.map((c) => c.ip), [filteredClients])

  const allRowsSelected =
    filteredClients.length > 0 && filteredClients.every((c) => selectedIps.includes(c.ip))

  const setSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIps((prev) => Array.from(new Set([...prev, ...visibleIps])))
    } else {
      setSelectedIps((prev) => prev.filter((ip) => !visibleIps.includes(ip)))
    }
  }

  const setRowSelected = (ip: string, checked: boolean) => {
    setSelectedIps((prev) => {
      if (checked) return prev.includes(ip) ? prev : [...prev, ip]
      return prev.filter((x) => x !== ip)
    })
  }

  const persist = async (next: Client[]) => {
    const deduped = uniqByIp(next).filter((c) => parseIp(c.ip) !== null)
    setClients(deduped)
    await saveClients(deduped)
  }

  const openAddSingle = () => {
    setEditingIp(null)
    setNewName('')
    setNewIp('192.168.1.10')
    setNewType('non-vip')
    setAddOpen(true)
  }

  const openEditSingle = (client: Client) => {
    setEditingIp(client.ip)
    setNewName(client.name)
    setNewIp(client.ip)
    setNewType(client.type)
    setAddOpen(true)
  }

  const ipInUse = useMemo(() => {
    const needle = newIp.trim().toLowerCase()
    if (!needle) return false
    return clients.some((c) => {
      if (editingIp && c.ip === editingIp) return false
      return c.ip.trim().toLowerCase() === needle
    })
  }, [clients, editingIp, newIp])

  const handleSaveSingle = async () => {
    const name = newName.trim()
    const ip = newIp.trim()
    if (!name) return
    if (!parseIp(ip)) return
    if (ipInUse) {
      window.alert('That IP address is already assigned to another client.')
      return
    }

    if (!editingIp) {
      await persist([...clients, { name, ip, type: newType }])
      setAddOpen(false)
      return
    }

    await persist(clients.map((c) => (c.ip === editingIp ? { name, ip, type: newType } : c)))
    setAddOpen(false)
  }

  const handleAddBulk = async () => {
    const prefix = bulkNamePrefix.trim() || 'Client'
    const start = parseIp(bulkStartIp)
    if (!start) return
    const count = clampInt(Number(bulkCount || '0'), 1, 500)
    const generated: Client[] = []
    for (let i = 0; i < count; i++) {
      const ip = ipToString(incrementIp(start, i))
      generated.push({ name: `${prefix}${i + 1}`, ip, type: bulkType })
    }
    await persist([...clients, ...generated])
    setBulkOpen(false)
  }

  const openDeleteClientsDialog = (ips: string[]) => {
    if (ips.length === 0) return
    setDeleteDialogIps(ips)
  }

  const confirmDeleteClients = async () => {
    if (!deleteDialogIps || deleteDialogIps.length === 0) return
    const toDelete = new Set(deleteDialogIps)
    const next = clients.filter((c) => !toDelete.has(c.ip))
    setSelectedIps((prev) => prev.filter((ip) => !toDelete.has(ip)))
    await persist(next)
    setDeleteDialogIps(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Clients</title>
      </Head>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl border-theme-border bg-theme-sidebar p-6 text-theme-text">
          <DialogHeader>
            <DialogTitle className="text-theme-text">
              {editingIp ? 'Edit Client' : 'Add Client'}
            </DialogTitle>
            <DialogDescription className="text-theme-muted">
              {editingIp ? 'Update a client device by IP address.' : 'Add a single client device by IP address.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Front Desk PC"
                className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">IP Address</label>
              <IpAddressInput value={newIp} onChange={setNewIp} />
              <div className="text-xs text-theme-muted">IPv4 only (e.g. 192.168.1.10)</div>
              {ipInUse && (
                <div className="text-xs text-theme-error">That IP is already in use.</div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Type</label>
              <Select value={newType} onValueChange={(v) => setNewType(v as ClientType)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="non-vip">Non‑VIP</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-theme-border bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
              onClick={() => {
                setAddOpen(false)
                setEditingIp(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
              onClick={() => void handleSaveSingle()}
              disabled={!newName.trim() || !parseIp(newIp.trim()) || ipInUse}
            >
              {editingIp ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-xl border-theme-border bg-theme-sidebar p-6 text-theme-text">
          <DialogHeader>
            <DialogTitle className="text-theme-text">Add Multiple Clients</DialogTitle>
            <DialogDescription className="text-theme-muted">
              Generate a block of clients from a starting IP address.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Name prefix</label>
              <Input
                value={bulkNamePrefix}
                onChange={(e) => setBulkNamePrefix(e.target.value)}
                placeholder="e.g. Station"
                className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-theme-muted">Starting IP</label>
              <IpAddressInput value={bulkStartIp} onChange={setBulkStartIp} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm text-theme-muted">Count</label>
                <Input
                  inputMode="numeric"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  placeholder="5"
                  className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-theme-muted">Type</label>
                <Select value={bulkType} onValueChange={(v) => setBulkType(v as ClientType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non-vip">Non‑VIP</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-theme-border bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
              onClick={() => setBulkOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
              onClick={() => void handleAddBulk()}
              disabled={!parseIp(bulkStartIp.trim()) || clampInt(Number(bulkCount || '0'), 1, 500) < 1}
            >
              Generate & Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="wails-no-drag ml-auto flex w-full items-center gap-2 mb-4">
        <div className="flex w-[360px] items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clients"
            className="border-theme-border bg-theme-card text-theme-text placeholder:text-theme-muted"
            aria-label="Search clients"
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
          {selectedIps.length > 0 && (
            <Button
              variant="secondary"
              className="bg-theme-secondary text-theme-text hover:bg-theme-error/85"
              onClick={() => openDeleteClientsDialog(selectedIps)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </Button>
          )}
          <Button
            variant="secondary"
            className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
            onClick={() => setBulkOpen(true)}
          >
            <Users className="h-4 w-4" />
            Add Multiple
          </Button>
          <Button
            className="bg-theme-primary text-theme-text hover:bg-theme-primary-hover"
            onClick={openAddSingle}
          >
            <Plus className="h-4 w-4" />
            Add Client
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
                    aria-label="Select all clients"
                  />
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Name
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  IP Address
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-theme-secondary-text backdrop-blur">
                  Type
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-theme-sidebar text-right text-theme-secondary-text backdrop-blur">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((c) => (
                <TableRow key={c.ip} className="hover:bg-theme-card">
                  <TableCell>
                    <Checkbox
                      checked={selectedIps.includes(c.ip)}
                      onCheckedChange={(value) => setRowSelected(c.ip, value === true)}
                      aria-label={`Select ${c.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-theme-text">{c.name}</TableCell>
                  <TableCell className="font-mono text-theme-text">{c.ip}</TableCell>
                  <TableCell className="text-theme-text">{clientTypeLabel(c.type)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover"
                        onClick={() => openEditSingle(c)}
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="bg-theme-secondary text-theme-text hover:bg-theme-error"
                        onClick={() => openDeleteClientsDialog([c.ip])}
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {/* {sortedClients.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-theme-muted">
                    No clients yet. Add one to start restricting games by IP.
                  </TableCell>
                </TableRow>
              )} */}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={deleteDialogIps !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogIps(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialogIps && deleteDialogIps.length === 1 ? 'Delete this client?' : 'Delete clients?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {deleteDialogIps && deleteDialogIps.length === 1
                ? (() => {
                    const ip = deleteDialogIps[0]
                    const row = clients.find((c) => c.ip === ip)
                    const label = row ? `${row.name} (${ip})` : ip
                    return `${label} will be removed. This cannot be undone.`
                  })()
                : deleteDialogIps
                  ? `${deleteDialogIps.length} clients will be removed. This cannot be undone.`
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
                void confirmDeleteClients()
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

