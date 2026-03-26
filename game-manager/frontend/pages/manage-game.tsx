import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { AddGameDialog } from '@/components/add-game-dialog'
import { loadGames } from '@/lib/games-storage'
import type { Game } from '@/lib/game'

export default function ManageGamePage() {
  const router = useRouter()
  const { id } = router.query

  const [open, setOpen] = useState(true)
  const [initialGame, setInitialGame] = useState<Game | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (typeof id === 'string') {
        const games = await loadGames()
        const game = games.find((g) => g.id === Number(id))
        if (!game) {
          void router.push('/games')
          return
        }
        setInitialGame(game)
      } else {
        setInitialGame(undefined)
      }
      setReady(true)
    }

    void load()
  }, [id, router])

  if (!ready) return null

  return (
    <>
      <Head>
        <title>{initialGame ? 'Edit Game' : 'Add Game'}</title>
      </Head>
      <AddGameDialog
        open={open}
        mode={initialGame ? 'edit' : 'add'}
        initialGame={initialGame}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) void router.push('/games')
        }}
      />
    </>
  )
}

