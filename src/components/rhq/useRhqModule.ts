'use client'

import { useEffect, useState } from 'react'

/**
 * Fetches one RHQ event-page module from its LP route handler (/api/rhq/<path>)
 * for a given RHQ tournament slug. Returns `data === null` while loading,
 * `failed === true` on a network/server error. The route normalizes "no data
 * yet" to an empty array, so an empty array is a valid loaded state.
 *
 * `key` is the response envelope key the route returns (`{ [key]: data }`).
 *
 * `pollMs` (optional) re-fetches on that interval so live sections stay current
 * during an event — the 60s-polling fallback for SSE. A re-poll updates in place
 * (it does NOT reset to null), so the UI doesn't flash back to its skeleton.
 */
export function useRhqModule<T>(
  path: string,
  slug: string,
  key: string,
  pollMs?: number
): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setData(null)
    setFailed(false)

    const load = () =>
      fetch(`/api/rhq/${path}?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d) => {
          if (active) {
            setData((d[key] ?? null) as T)
            setFailed(false)
          }
        })
        .catch(() => {
          if (active) setFailed(true)
        })

    load()
    const id = pollMs ? setInterval(load, pollMs) : undefined
    return () => {
      active = false
      if (id) clearInterval(id)
    }
  }, [path, slug, key, pollMs])

  return { data, failed }
}
