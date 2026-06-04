'use client'

import { useEffect, useState } from 'react'

/**
 * Fetches one RHQ event-page module from its LP route handler (/api/rhq/<path>)
 * for a given RHQ tournament slug. Returns `data === null` while loading,
 * `failed === true` on a network/server error. The route normalizes "no data
 * yet" to an empty array, so an empty array is a valid loaded state.
 *
 * `key` is the response envelope key the route returns (`{ [key]: data }`).
 */
export function useRhqModule<T>(
  path: string,
  slug: string,
  key: string
): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setData(null)
    setFailed(false)
    fetch(`/api/rhq/${path}?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (active) setData((d[key] ?? null) as T)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [path, slug, key])

  return { data, failed }
}
