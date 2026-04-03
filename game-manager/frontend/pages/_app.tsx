import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/app-shell'
import { DM_Sans, Outfit } from 'next/font/google'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '700'],
  display: 'swap',
})

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

  // Radix UI components render via portals into `document.body`.
  // Apply the Next/font CSS-variable classes to `document.documentElement`
  // so all portals inherit typography.
  useEffect(() => {
    const classes = [outfit.variable, dmSans.variable].filter(Boolean)
    document.documentElement.classList.add(...classes)
    return () => {
      document.documentElement.classList.remove(...classes)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={`${outfit.variable} ${dmSans.variable} h-screen w-screen overflow-hidden font-sans antialiased`}
      >
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
      </div>
    </QueryClientProvider>
  )
}

export default MyApp
