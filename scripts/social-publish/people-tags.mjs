/**
 * Build the 630 team -> player -> Instagram account list used to pick people tags.
 *
 * Teams come from LeagueApps team-placement registrations, accounts from the athlete's own
 * "Athlete Instagram Handle" member field, and jersey numbers from AES published rosters
 * (photos are matched to players by jersey). Accounts opened by hand (--checked) win over the
 * registration field, which families type and which disagreed with 6 of 14 checked accounts
 * on 18-1/18-2 (2026-10-28). Graph refusals (--refused) are marked because one refused tag
 * rejects the whole post.
 *
 * The output names minors, so it is written only outside this public repository.
 *
 *   LEAGUEAPPS_PRIVATE_KEY="$(op read 'op://Developer Secrets/LeagueApps 630volleyball/credential')" \
 *   LEAGUEAPPS_CLIENT_ID="$(op read 'op://Developer Secrets/LeagueApps 630volleyball/key_id')" \
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/social-publish/people-tags.mjs \
 *     --programs 5156173,5156174 --aes-since 2026-09-01 \
 *     --checked <tag-matches.json> --refused <graph-refused.json> --out /Volumes/photo/630/people-tags
 */
import { readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { walkLeagueAppsExport } from './analytics-contract.mjs'
import { leagueAppsAccessToken } from './worker/src/registrations.js'

export const HANDLE_FIELD = 'Athlete Instagram Handle'
export const AES_CLUB = 24426 // 630 Volleyball
const SITE = 54390
const AES = 'https://results.advancedeventsystems.com'
const AES_HEADERS = { Accept: 'application/json', 'User-Agent': 'letspepper-social-publish/people-tags' }

// What families type when there is no account. Anything else that is not a valid handle is
// kept verbatim as "not a handle" so a person can read it.
const NO_ACCOUNT = /^(n\/?a|na|none|no|nope|null|private|unknown|idk|tbd|-+|\.|x|not applicable|n\.a\.?|don'?t have( one)?|do not have( one)?|no instagram)$/i

export function parseHandle(raw) {
  const text = raw === undefined || raw === null ? '' : String(raw).trim()
  if (!text) return { status: 'missing' }
  if (NO_ACCOUNT.test(text)) return { status: 'none given', raw: text }
  const handle = text.replace(/^https?:\/\//i, '').replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^@+/, '').trim().toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(handle) ? { status: 'handle', handle } : { status: 'not a handle', raw: text }
}

/** AES publishes "Last, First"; LeagueApps keeps them apart. Compare letters only. */
const letters = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
export function splitAesName(full) {
  const [last, ...rest] = String(full).split(',')
  return { last: (last || '').trim(), first: rest.join(',').trim() }
}

/** Match within one team only: full name, then last name plus first initial, then a lone last name. */
export function matchRoster(laPlayers, aesRoster) {
  const aes = [], coaches = [], used = new Set()
  for (const entry of aesRoster) {
    const { last, first } = splitAesName(entry.FullName)
    const role = String(entry.RoleOrJersey ?? '').trim()
    if (/^\d+$/.test(role)) aes.push({ last, first, jersey: role, full: entry.FullName })
    else coaches.push({ name: `${first} ${last}`.trim(), role })
  }
  const matched = laPlayers.map(p => {
    const open = aes.map((a, i) => ({ a, i })).filter(({ a, i }) => !used.has(i) && letters(a.last) === letters(p.last))
    let hit = open.find(({ a }) => letters(a.first) === letters(p.first)), how = 'name'
    if (!hit) { hit = open.find(({ a }) => letters(a.first)[0] === letters(p.first)[0]); how = 'last name + first initial' }
    if (!hit && open.length === 1) { hit = open[0]; how = 'last name only' }
    if (!hit) return { player: p }
    used.add(hit.i)
    return { player: p, aes: hit.a, how }
  })
  return { matched, aesOnly: aes.filter((_, i) => !used.has(i)), coaches }
}

const teamSort = (a, b) => {
  const [aa, an] = a.split('-').map(Number), [ba, bn] = b.split('-').map(Number)
  return ba - aa || an - bn
}

/**
 * registrations/members: LeagueApps export rows. aesTeams: Map of "18-1" -> AES roster entries.
 * checked: Map of "team#jersey" -> { accounts, evidence, date }. refused: { handle: date }.
 */
export function buildTagList({ registrations, members, programs, aesTeams, checked = new Map(), refused = {} }) {
  const latest = new Map()
  for (const m of members) if (!latest.has(m.userId) || m.lastUpdated >= latest.get(m.userId).lastUpdated) latest.set(m.userId, m)
  const placed = registrations.filter(r => programs.has(r.programId) && !r.deleted && r.registrationStatus === 'SPOT_RESERVED' && r.team)
  const players = placed.filter(r => !r.isStaff).map(r => ({
    team: r.team.replace(/^B/, ''), userId: r.userId, first: r.firstName, last: r.lastName,
    handle: parseHandle(latest.get(r.userId)?.[HANDLE_FIELD]),
    parentOnly: !latest.get(r.userId)?.[HANDLE_FIELD] && !!latest.get(r.parentUserId)?.[HANDLE_FIELD],
  }))
  const teamsOf = new Map(), handleOwners = new Map()
  for (const p of players) {
    teamsOf.set(p.userId, new Set([...(teamsOf.get(p.userId) || []), p.team]))
    if (p.handle.handle) handleOwners.set(p.handle.handle, new Set([...(handleOwners.get(p.handle.handle) || []), p.userId]))
  }

  const rows = [], aesOnly = [], coaches = []
  for (const team of [...new Set([...players.map(p => p.team), ...aesTeams.keys()])].sort(teamSort)) {
    const roster = aesTeams.get(team)
    const result = matchRoster(players.filter(p => p.team === team), roster || [])
    aesOnly.push(...result.aesOnly.map(a => ({ team, jersey: a.jersey, name: `${a.first} ${a.last}`, aesName: a.full })))
    coaches.push(...result.coaches.map(c => ({ team, ...c })))
    for (const { player: p, aes, how } of result.matched) {
      const typed = p.handle.handle || ''
      const hand = aes ? checked.get(`${team}#${aes.jersey}`) : undefined
      let account = typed, check = typed ? 'unchecked: LeagueApps registration field' : ''
      if (hand) {
        account = hand.accounts.includes(typed) ? typed : hand.accounts[0]
        check = !typed ? `checked ${hand.date} (LeagueApps had none)`
          : hand.accounts.includes(typed) ? `checked ${hand.date}, matches LeagueApps`
          : `checked ${hand.date}; LeagueApps says @${typed}`
      }
      const flags = [
        p.parentOnly && 'handle only on parent record (not used)',
        teamsOf.get(p.userId).size > 1 && 'on more than one team',
        typed && handleOwners.get(typed).size > 1 && 'handle shared with another player',
      ].filter(Boolean)
      rows.push({
        team, jersey: aes?.jersey || '', name: `${p.first} ${p.last}`, aesName: aes?.full || '',
        account, check, graph: refused[account] ? `refused ${refused[account]}` : '',
        aes: aes ? (how === 'name' ? 'on AES roster' : `on AES roster (${how})`) : roster ? 'not on AES roster' : 'team not on AES yet',
        flags: flags.join('; '), leagueappsHandle: typed, handleStatus: p.handle.status, whatFamilyWrote: p.handle.raw || '',
        otherAccounts: hand ? hand.accounts.filter(a => a !== account) : [], checkEvidence: hand?.evidence || '',
      })
    }
  }
  const order = new Map([...new Set(rows.map(r => r.team))].map((t, i) => [t, i]))
  rows.sort((a, b) => order.get(a.team) - order.get(b.team) || (Number(a.jersey) || 999) - (Number(b.jersey) || 999))
  return { players: rows, aesOnly, coaches }
}

/** Hand-checked accounts in the picture-day tag-matches.json shape. Weak matches do not count. */
export function readChecked(paths) {
  const checked = new Map()
  for (const path of paths) {
    const date = statSync(path).mtime.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    for (const v of JSON.parse(readFileSync(path, 'utf8')).players || []) {
      const accounts = String(v.account || '').toLowerCase().split(/\s+or\s+/).map(s => s.trim().replace(/^@/, '')).filter(Boolean)
      if (accounts.length && /strong|medium/.test(v.confidence || '')) checked.set(`${v.team}#${v.jersey}`, { accounts, evidence: v.evidence || '', date })
    }
  }
  return checked
}

export function toCsv(rows) {
  const cell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '')
  const header = ['team', 'jersey', 'name', 'account', 'check', 'graph', 'aes', 'flags', 'other_accounts', 'what_family_wrote']
  return [header.join(','), ...rows.map(r => [r.team, r.jersey, r.name, r.account && `@${r.account}`, r.check, r.graph, r.aes, r.flags,
    r.otherAccounts.map(a => `@${a}`).join(' '), r.whatFamilyWrote].map(cell).join(','))].join('\n') + '\n'
}

async function aesJson(url) {
  const response = await fetch(url, { headers: AES_HEADERS, signal: AbortSignal.timeout(20000) })
  if (response.status === 204) return null
  if (!response.ok) throw new Error(`AES ${response.status} for ${new URL(url).pathname}`)
  return response.json()
}

/** The AES directory does not say which clubs entered an event, so each posted event is opened. */
async function findClubEvents(since) {
  const events = []
  for (let skip = 0; ; skip += 200) {
    const url = new URL('https://www.advancedeventsystems.com/api/landing/events')
    url.search = new URLSearchParams({ $filter: `startDate ge ${since}T00:00:00Z and isSchedulerPosted eq true`, $format: 'json', $orderby: 'startDate,name', $top: '200', $skip: String(skip) }).toString()
    const page = (await aesJson(url)).value || []
    events.push(...page)
    if (page.length < 200) break
  }
  const keys = [], queue = events.map(e => e.eventSchedulerKey).filter(Boolean)
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const key = queue.shift()
      const event = await aesJson(`${AES}/api/event/${key}`).catch(() => null)
      if (event?.Clubs?.some(c => c.ClubId === AES_CLUB)) keys.push(key)
    }
  }))
  return keys
}

async function fetchAesTeams(keys) {
  const teams = new Map(), events = []
  for (const key of keys) {
    const event = await aesJson(`${AES}/api/event/${key}`)
    const assignments = await aesJson(`${AES}/odata/${key}/nextassignments(dId=null,cId=${AES_CLUB},tIds=[])?$skip=0&$orderby=TeamName,TeamCode`)
    const seen = new Set()
    for (const a of assignments?.value || []) {
      const team = /630 Volleyball (\d+-\d+)/.exec(a.TeamName)?.[1]
      if (!team || seen.has(a.TeamId)) continue
      seen.add(a.TeamId)
      // A team entered in two events keeps its most recent roster.
      teams.set(team, (await aesJson(`${AES}/api/event/${key}/division/${a.TeamDivision.DivisionId}/team/${a.TeamId}/roster`)) || [])
    }
    events.push({ key, eventId: event.EventId, name: event.Name, start: event.StartDate })
  }
  return { teams, events }
}

async function readLeagueApps(type, env) {
  const rows = []
  let token = await leagueAppsAccessToken(env, fetch)
  await walkLeagueAppsExport(async cursor => {
    const url = new URL(`https://admin.leagueapps.io/v2/sites/${SITE}/export/${type}`)
    url.searchParams.set('last-updated', String(cursor.lastUpdated))
    url.searchParams.set('last-id', String(cursor.lastId))
    let response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' })
    if (response.status === 401) {
      token = await leagueAppsAccessToken(env, fetch)
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' })
    }
    if (!response.ok) throw new Error(`LeagueApps ${type} read failed (${response.status})`)
    return response.json()
  }, row => rows.push(row), { maxPages: 60 })
  return rows
}

function outsideRepo(path) {
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..')).split('/.worktrees/')[0]
  const absolute = realpathSync(path)
  if (!relative(repo, absolute).startsWith('../')) throw new Error('Write the list outside the repository; it names minors')
  return absolute
}

async function main() {
  const { values } = parseArgs({ options: {
    programs: { type: 'string' }, 'aes-since': { type: 'string' }, 'aes-events': { type: 'string' },
    checked: { type: 'string', multiple: true, default: [] }, refused: { type: 'string' }, out: { type: 'string' },
  } })
  if (!values.programs || !values.out || !(values['aes-since'] || values['aes-events'])) {
    throw new Error('Usage: --programs <id,id> --out <dir outside repo> (--aes-since YYYY-MM-DD | --aes-events <key,key>) [--checked <file>]... [--refused <file>]')
  }
  const out = outsideRepo(values.out)
  const env = { LEAGUEAPPS_PRIVATE_KEY: process.env.LEAGUEAPPS_PRIVATE_KEY, LEAGUEAPPS_CLIENT_ID: process.env.LEAGUEAPPS_CLIENT_ID }
  if (!env.LEAGUEAPPS_PRIVATE_KEY || !env.LEAGUEAPPS_CLIENT_ID) throw new Error('Set LEAGUEAPPS_PRIVATE_KEY and LEAGUEAPPS_CLIENT_ID (see the header comment)')
  const programs = new Set(values.programs.split(',').map(Number))
  const keys = values['aes-events'] ? values['aes-events'].split(',') : await findClubEvents(values['aes-since'])
  const aes = await fetchAesTeams(keys)
  const fetchedAt = new Date().toISOString()
  const [registrations, members] = [await readLeagueApps('registrations-2', env), await readLeagueApps('members-2', env)]
  const refused = values.refused ? JSON.parse(readFileSync(values.refused, 'utf8')) : {}
  const list = buildTagList({ registrations, members, programs, aesTeams: aes.teams, checked: readChecked(values.checked), refused })
  const stamp = fetchedAt.slice(0, 10)
  writeFileSync(`${out}/aes-rosters-${stamp}.json`, JSON.stringify({ fetchedAt, club: AES_CLUB, events: aes.events, teams: Object.fromEntries(aes.teams) }, null, 1))
  writeFileSync(`${out}/team-tags.json`, JSON.stringify({
    asOf: fetchedAt,
    sources: {
      teams: `LeagueApps registrations-2, programs ${[...programs].join(', ')}, SPOT_RESERVED, staff excluded`,
      accounts: `LeagueApps members-2 "${HANDLE_FIELD}" on the athlete's own record; typed by families`,
      jerseys: `AES rosters fetched ${fetchedAt}: ${aes.events.map(e => `${e.name} (${e.eventId})`).join('; ')}`,
      checked: values.checked, refused: values.refused || null,
    },
    ...list,
  }, null, 1))
  writeFileSync(`${out}/team-tags.csv`, toCsv(list.players))
  const withAccount = list.players.filter(r => r.account).length
  console.log(`${list.players.length} players on ${new Set(list.players.map(r => r.team)).size} teams; ${withAccount} with an account; ${list.aesOnly.length} AES-only; written to ${out}`)
}

// realpathSync before comparing: a symlinked cwd otherwise breaks the entry-point check.
let isEntryPoint = false
try { isEntryPoint = import.meta.url === pathToFileURL(realpathSync(process.argv[1] || '')).href } catch { /* not the entry point */ }
if (isEntryPoint) {
  main().catch(e => { console.error(`ERROR — ${e.message}`); process.exitCode = 1 })
}
