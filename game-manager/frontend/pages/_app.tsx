import '../styles/globals.css'
import type { AppProps } from 'next/app'

import { AppShell } from '@/components/app-shell'

function MyApp({ Component, pageProps }: AppProps) {

  return (
    <AppShell>
      <Component {...pageProps} />
    </AppShell>
  )
}

export default MyApp
