import '../styles/globals.css'
import type { AppProps } from 'next/app'
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
  return (
    <div className={`${outfit.variable} ${dmSans.variable} min-h-screen font-sans antialiased`}>
      <Component {...pageProps} />
    </div>
  )
}

export default MyApp
