import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, Martian_Mono } from 'next/font/google'
import { ThemeSync } from '@/components/layout/ThemeSync'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' })
const ui = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const mono = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', display: 'swap' })

export const metadata: Metadata = {
  title: 'Cubiq — cube timer, stats, solvers and trainer',
  description: 'A speedcubing timer with WCA stats, solvers for nine puzzles and an OLL/PLL trainer — all in your browser.',
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
