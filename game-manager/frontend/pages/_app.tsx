import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppShell } from '@/components/app-shell'

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </QueryClientProvider>
  )
}

export default MyApp
