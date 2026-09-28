import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Learn', description: 'Drill all 21 PLL and 57 OLL cases with spaced repetition, and practise planning the cross.', openGraph: { title: 'Learn · Cubiq', description: 'Drill all 21 PLL and 57 OLL cases with spaced repetition, and practise planning the cross.', images: [{ url: 'og.png', width: 1200, height: 630 }] } }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
