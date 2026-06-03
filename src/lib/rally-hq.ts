/**
 * Rally HQ API client (server-side only).
 *
 * Rally HQ (rallyhq.app) is the operational backend for the Let's Pepper series:
 * it owns tournament truth and — via ADR-0007 — the cross-surface FAN IDENTITY
 * that lets a single human be recognized on both letspepper.com and rallyhq.app.
 * Two domains on two Supabase projects can't share auth, so Rally HQ issues an
 * anonymous `fan_token` that this site stores per device and presents with
 * engagement writes. We hold the API key; the fan itself stays anonymous.
 *
 * Every call here is best-effort by design: a Rally HQ outage must never break a
 * local pick. Callers treat a null/throw as "no cross-surface identity this time"
 * and continue with the local-only flow.
 */

export interface RallyFan {
  fanToken: string
  displayName: string | null
  claimed: boolean
}

function config(): { url: string; key: string } | null {
  const url = process.env.RALLY_HQ_API_URL
  const key = process.env.RALLY_HQ_API_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, ''), key }
}

interface RallyEnvelope<T> {
  data?: T
  error?: { message?: string }
}

async function call<T>(path: string, init: RequestInit): Promise<T | null> {
  const cfg = config()
  if (!cfg) {
    console.warn('Rally HQ env not configured; skipping cross-surface identity')
    return null
  }
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const body = (await res.json().catch(() => null)) as RallyEnvelope<T> | null
    if (!res.ok || !body?.data) {
      console.error(`Rally HQ ${init.method ?? 'GET'} ${path} failed:`, res.status, body?.error?.message)
      return null
    }
    return body.data
  } catch (err) {
    console.error(`Rally HQ ${init.method ?? 'GET'} ${path} threw:`, err)
    return null
  }
}

/** Mint a new anonymous fan identity, optionally with a nickname. */
export function issueFan(displayName: string | null): Promise<RallyFan | null> {
  return call<RallyFan>('/api/v1/fans', {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  })
}

/** Set/clear a fan's nickname on Rally HQ (keeps the unified leaderboard named). */
export function updateFanName(fanToken: string, displayName: string | null): Promise<RallyFan | null> {
  return call<RallyFan>(`/api/v1/fans/${fanToken}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  })
}
