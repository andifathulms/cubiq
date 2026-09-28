import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Progress', description: 'Records, trend, consistency and your full solve log.', openGraph: { title: 'Progress · Cubiq', description: 'Records, trend, consistency and your full solve log.', images: [{ url: 'og.png', width: 1200, height: 630 }] } }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
