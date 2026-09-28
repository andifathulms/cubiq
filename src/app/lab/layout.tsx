import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Solve Lab', description: 'Solve any scramble for nine puzzles — CFOP, reduction, optimal — stage by stage in your browser.', openGraph: { title: 'Solve Lab · Cubiq', description: 'Solve any scramble for nine puzzles — CFOP, reduction, optimal — stage by stage in your browser.', images: [{ url: 'og.png', width: 1200, height: 630 }] } }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
