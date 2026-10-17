/** Read LeagueApps privately; publish only the canonical aggregate allowlist. */
import { createRegistrationRollup, walkLeagueAppsExport, reportingWindow, registrationSnapshotProperties, REGISTRATION_EVENT, REGISTRATION_VERSION } from '../../analytics-contract.mjs'

export const REGISTRATIONS_CRON = '15 11 * * *'
export const REGISTRATIONS_STATUS_KEY = 'analytics:630:registrations:status'
const AUTH_URL = 'https://auth.leagueapps.io/v2/auth/token'
const EXPORT_URL = 'https://admin.leagueapps.io/v2/sites/54390/export/registrations-2'
const CAPTURE_URL = 'https://us.i.posthog.com/i/v0/e/'
const encoder = new TextEncoder()
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const encodedJson = value => base64url(encoder.encode(JSON.stringify(value)))

export async function leagueAppsAccessToken(env, request, now = new Date()) {
  // Existing 630 credential is PKCS8 PEM. Web Crypto avoids a Node runtime dependency.
  const pem = env.LEAGUEAPPS_PRIVATE_KEY.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const iat = Math.floor(now.getTime() / 1000)
  const unsigned = `${encodedJson({alg:'RS256',typ:'JWT'})}.${encodedJson({aud:AUTH_URL,iss:env.LEAGUEAPPS_CLIENT_ID,sub:env.LEAGUEAPPS_CLIENT_ID,iat,exp:iat+300})}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned))
  const response = await request(AUTH_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }),
  })
  if (!response.ok) throw new Error('LeagueApps authentication failed')
  const result = await response.json()
  if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('LeagueApps authentication failed')
  return result.access_token
}

export async function runRegistrations(env, { trigger = 'manual', now = new Date(), fetch: fetchImpl = globalThis.fetch } = {}) {
  const window = reportingWindow({ now })
  let requests = 0
  // Isolated cron: never shares Instagram's request budget or the publisher's queue.
  const request = async (url, options = {}) => {
    if (++requests > 45) throw new Error('Registration refresh request limit exceeded')
    // Workers supports manual redirects; Node also accepts an unsupported-at-edge "error" mode.
    // Every caller rejects non-2xx, so a redirect cannot forward provider credentials.
    return fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20000) })
  }
  const record = async value => { await env.QUEUE.put(REGISTRATIONS_STATUS_KEY, JSON.stringify(value)); return value }
  if (!env.LEAGUEAPPS_PRIVATE_KEY || !env.LEAGUEAPPS_CLIENT_ID || !env.POSTHOG_630_PROJECT_TOKEN) {
    return record({ status: 'unavailable', trigger, checkedAt: now.toISOString(), reason: 'Registration refresh credentials are missing' })
  }
  let snapshot, diagnostic
  try {
    let token = await leagueAppsAccessToken(env, request, now)
    let renewed = false
    const rollup = createRegistrationRollup(window)
    diagnostic = await walkLeagueAppsExport(async cursor => {
      const url = new URL(EXPORT_URL)
      url.searchParams.set('last-updated', String(cursor.lastUpdated))
      url.searchParams.set('last-id', String(cursor.lastId))
      let response = await request(url, { headers: { Authorization: `Bearer ${token}` } })
      if (response.status === 401 && !renewed) {
        token = await leagueAppsAccessToken(env, request)
        renewed = true
        response = await request(url, { headers: { Authorization: `Bearer ${token}` } })
      }
      if (!response.ok) throw new Error('LeagueApps export read failed')
      return response.json()
    }, row => rollup.add(row))
    snapshot = rollup.finish(new Date().toISOString())
  } catch {
    // Provider bodies and exception messages can contain records or credentials.
    snapshot = { version: REGISTRATION_VERSION, status: 'unavailable', window, asOf: new Date().toISOString() }
  }
  const properties = registrationSnapshotProperties(snapshot, trigger)
  const runId = crypto.randomUUID()
  try {
    const response = await request(CAPTURE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.POSTHOG_630_PROJECT_TOKEN, event: REGISTRATION_EVENT, distinct_id: runId, uuid: runId, timestamp: snapshot.asOf, properties }),
    })
    if (!response.ok) throw new Error('Capture rejected')
    const receipt = await response.json()
    if (receipt.status !== 1 && receipt.status !== 'Ok') throw new Error('Capture not accepted')
    return record({ status: properties.status, version: REGISTRATION_VERSION, delivery: 'accepted', trigger, runId, checkedAt: snapshot.asOf, requests, ...diagnostic,
      window: { start: window.start, end: window.end }, ...(properties.status === 'verified' ? { current: snapshot.current, previous: snapshot.previous, groups: snapshot.groups } : { reason: 'LeagueApps refresh incomplete; no totals published' }) })
  } catch {
    return record({ status: 'unavailable', delivery: 'failed', trigger, runId, checkedAt: snapshot.asOf, requests, reason: 'PostHog did not accept the registration refresh' })
  }
}

export async function registrationsStatus(env) {
  return await env.QUEUE.get(REGISTRATIONS_STATUS_KEY, 'json') || { status: 'unavailable', reason: 'No registration refresh recorded' }
}
