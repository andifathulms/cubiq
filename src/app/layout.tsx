import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cubiq — Train faster. Solve smarter.',
  description: 'Modern Rubik\'s Cube training platform with timer, stats, and 3D cube preview.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  )
}
