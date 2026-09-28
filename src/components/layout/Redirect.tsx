'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Client-side redirect for renamed routes (static export has no server
 *  redirects). Keeps the query string, e.g. /solvers?puzzle=444 -> /lab?puzzle=444. */
export function Redirect({ to, hash }: { to: string; hash?: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(to + window.location.search + (hash ?? window.location.hash))
  }, [router, to, hash])
  return <p className="p-8 text-sm text-muted">Moving you to the new page…</p>
}
