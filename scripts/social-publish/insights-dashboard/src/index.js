/**
 * 630-instagram-insights: a read-only dashboard over the social-insights D1 database
 * (../../INSIGHTS.md, "The dashboard"). One passphrase, held in 1Password and set as the
 * DASHBOARD_PASSPHRASE secret, signs a viewer in for 30 days.
 *
 * Bindings (wrangler.jsonc):
 *   INSIGHTS_DB           the scheduler Worker's database; this Worker only SELECTs
 *   DASHBOARD_PASSPHRASE  the shared passphrase (secret). Absent means nobody can sign in.
 *   SIGN_IN_LIMIT         rate limiter for sign-in attempts, keyed by client IP
 *
 * Sign-in and the session cookie live in ./auth.js. This module exports only the handler:
 * the Workers runtime treats every named export of the main module as an entry point.
 */

import { loadDashboard, DEFAULT_PERIOD } from './data.js'
import { dashboardPage, signInPage, errorPage } from './page.js'
import { businessSuitePage } from './business-suite-page.js'
import { loadBusinessSuite, loadBusinessSuiteStatus } from './business-suite.js'
import { COOKIE, securityHeaders, base64Url, passphraseMatches, sessionCookie, validSession } from './auth.js'

function html(body, { status = 200, nonce = null, headers = {} } = {}) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders(nonce), ...headers } })
}

const clearCookie = `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`

async function signIn(request, env) {
  if (!env.DASHBOARD_PASSPHRASE) return html(signInPage({ configured: false }), { status: 503 })
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  if (env.SIGN_IN_LIMIT) {
    const { success } = await env.SIGN_IN_LIMIT.limit({ key: ip })
    if (!success) return html(signInPage({ error: 'Too many attempts. Wait a minute and try again.' }), { status: 429 })
  }
  let submitted = ''
  try { submitted = String((await request.formData()).get('passphrase') ?? '') } catch { submitted = '' }
  if (!(await passphraseMatches(submitted, env.DASHBOARD_PASSPHRASE))) {
    return html(signInPage({ error: "That passphrase didn't match." }), { status: 401 })
  }
  return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': await sessionCookie(env.DASHBOARD_PASSPHRASE), ...securityHeaders(null) } })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/sign-in' && request.method === 'POST') return signIn(request, env)
    if (url.pathname === '/sign-out' && request.method === 'POST') {
      return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': clearCookie, ...securityHeaders(null) } })
    }
    if (!['/','/business-suite'].includes(url.pathname)) return new Response('Not found', { status: 404, headers: securityHeaders(null) })
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: securityHeaders(null) })
    if (!env.DASHBOARD_PASSPHRASE) return html(signInPage({ configured: false }), { status: 503 })
    if (!(await validSession(request, env.DASHBOARD_PASSPHRASE))) return html(signInPage())
    let data
    try {
      if (url.pathname === '/business-suite') {
        const [report,status]=await Promise.all([loadBusinessSuite(env.INSIGHTS_DB),loadBusinessSuiteStatus(env.INSIGHTS_DB)])
        const nonce=base64Url(crypto.getRandomValues(new Uint8Array(16)))
        return html(businessSuitePage(report,{view:url.searchParams.get('view'),period:url.searchParams.get('period'),status,nonce}),{nonce})
      }
      data = await loadDashboard(env.INSIGHTS_DB, { period: url.searchParams.get('period') ?? DEFAULT_PERIOD, postsPeriod: url.searchParams.get('postsPeriod') ?? '30' })
      data.businessSuiteStatus=await loadBusinessSuiteStatus(env.INSIGHTS_DB)
    } catch {
      return html(errorPage(), { status: 503 })
    }
    const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)))
    return html(dashboardPage(data, { nonce }), { nonce })
  },
}
