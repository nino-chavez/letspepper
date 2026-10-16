/**
 * Passphrase sign-in for the dashboard. The session cookie is `v1.<expires>.<signature>`: an
 * HMAC-SHA256 of `v1.<expires>` keyed by the passphrase, so changing the passphrase signs
 * everyone out. Kept out of src/index.js because the Workers runtime treats every named
 * export of the main module as an entry point.
 */

export const COOKIE = 'insights_session'
export const SESSION_DAYS = 30
const encoder = new TextEncoder()

export const securityHeaders = (nonce) => ({
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy': [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    "img-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
})

export const base64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

/** Constant-time equality of two byte arrays of equal length. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Compare a submitted passphrase with the configured one without leaking where they differ. */
export async function passphraseMatches(submitted, configured) {
  // HMAC both under a fixed key so the comparison is over equal-length digests.
  const [a, b] = await Promise.all([hmac('passphrase-compare', String(submitted)), hmac('passphrase-compare', String(configured))])
  return sameBytes(a, b)
}

export async function sessionCookie(passphrase, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_DAYS * 86400
  const value = `v1.${expires}`
  const signature = base64Url(await hmac(passphrase, value))
  return `${COOKIE}=${value}.${signature}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

export async function validSession(request, passphrase, now = Date.now()) {
  if (!passphrase) return false
  const cookie = (request.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))
  if (!cookie) return false
  const [version, expires, signature] = cookie.slice(COOKIE.length + 1).split('.')
  if (version !== 'v1' || !/^\d+$/.test(expires ?? '') || !signature) return false
  if (Number(expires) * 1000 <= now) return false
  const expected = base64Url(await hmac(passphrase, `v1.${expires}`))
  return sameBytes(encoder.encode(expected), encoder.encode(signature))
}
