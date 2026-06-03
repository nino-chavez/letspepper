'use client'

import { useEffect, useState } from 'react'

/**
 * Fetches one RHQ embed module from its LP route handler (/api/rhq/<path>) for a
 * given flavor. Returns `data === null` while loading, `failed === true` on a
 * network/server error. The route handler normalizes "no data yet" to an empty
 * value, so an empty array is a valid loaded state (not an error).
 *
 * `key` is the response envelope key the route returns (`{ [key]: data }`).
 */
export function useRhqModule<T>(
  path: string,
  flavor: string,
  key: string
): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setData(null)
    setFailed(false)
    fetch(`/api/rhq/${path}?flavor=${encodeURIComponent(flavor)}`)
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
  }, [path, flavor, key])

  return { data, failed }
}
