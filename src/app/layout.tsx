import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, Martian_Mono } from 'next/font/google'
import { ThemeSync } from '@/components/layout/ThemeSync'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' })
const ui = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const mono = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', display: 'swap' })

// Absolute URLs for link previews (WhatsApp, Slack, X need them). The Pages
// workflow builds with PAGES_BASE_PATH=/cubiq.
const SITE = `https://andifathulms.github.io${process.env.PAGES_BASE_PATH ?? ''}/`
const DESCRIPTION = 'A speedcubing timer with WCA stats, solvers for nine puzzles and an OLL/PLL trainer — all in your browser.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Cubiq — cube timer, stats, solvers and trainer', template: '%s · Cubiq' },
  description: DESCRIPTION,
  applicationName: 'Cubiq',
  openGraph: {
    type: 'website',
    siteName: 'Cubiq',
    url: SITE,
    title: 'Cubiq — a cube timer that feels like the competition floor',
    description: DESCRIPTION,
    images: [{ url: 'og.png', width: 1200, height: 630, alt: 'Cubiq: a stackmat-style timer showing a new personal best of 11.62' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cubiq — a cube timer that feels like the competition floor',
    description: DESCRIPTION,
    images: ['og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F5F8' },
    { media: '(prefers-color-scheme: dark)', color: '#111318' },
  ],
}

// Applies a pinned theme before first paint (no light/dark flash).
const themeScript = `try{var s=JSON.parse(localStorage.getItem('cubiq:store')||'{}');var t=s.state&&s.state.settings&&s.state.settings.theme;if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${ui.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <ThemeSync />
        {children}
      </body>
    </html>
  )
}
