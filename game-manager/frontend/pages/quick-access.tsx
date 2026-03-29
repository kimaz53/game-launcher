import Head from 'next/head'
import { QuickAccessEditor } from '@/components/quick-access-editor'

export default function QuickAccessPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Head>
        <title>Quick Access</title>
      </Head>

      <div className="min-h-0 flex-1 rounded-xl bg-theme-card">
        <div className="h-full overflow-auto rounded-lg border border-theme-border bg-theme-app">
          <QuickAccessEditor />
        </div>
      </div>
    </div>
  )
}
