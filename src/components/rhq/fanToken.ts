/**
 * Anonymous RHQ fan_token, stored client-side and reused across embed write
 * modules (champion pick, engagement points). Issued via LP's /api/rhq/fan
 * route handler, which holds the API key — the token itself is an opaque,
 * unclaimed identity with no PII.
 */

const FAN_TOKEN_KEY = 'rhq_fan_token'

export function getStoredFanToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(FAN_TOKEN_KEY)
}

/** Return the stored fan_token, issuing and persisting a new one if absent. */
export async function ensureFanToken(): Promise<string> {
  const existing = getStoredFanToken()
  if (existing) return existing

  const res = await fetch('/api/rhq/fan', { method: 'POST' })
  if (!res.ok) throw new Error(`fan token issue failed (${res.status})`)
  const { fanToken } = (await res.json()) as { fanToken: string }

  window.localStorage.setItem(FAN_TOKEN_KEY, fanToken)
  return fanToken
}
