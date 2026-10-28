import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseHandle, splitAesName, matchRoster, buildTagList, readChecked, toCsv, HANDLE_FIELD } from '../people-tags.mjs'

// Synthetic people only. Shapes follow the LeagueApps registrations-2 / members-2 exports and the
// AES roster endpoint as read on 2026-10-28.
const reg = (userId, team, first, last, extra = {}) => ({
  programId: 1, registrationStatus: 'SPOT_RESERVED', deleted: false, isStaff: false, team, userId, firstName: first, lastName: last, ...extra,
})
const member = (userId, handle, lastUpdated = 1) => ({ userId, lastUpdated, ...(handle === undefined ? {} : { [HANDLE_FIELD]: handle }) })

test('parseHandle cleans typed handles and separates "no account" answers from prose', () => {
  assert.deepEqual(parseHandle('@Alex.Setter_7'), { status: 'handle', handle: 'alex.setter_7' })
  assert.deepEqual(parseHandle('https://www.instagram.com/alex_vb/?igsh=abc'), { status: 'handle', handle: 'alex_vb' })
  for (const none of ['N/A', 'na', 'None', '.', 'x', 'unknown', "don't have one"]) assert.equal(parseHandle(none).status, 'none given', none)
  assert.deepEqual(parseHandle('Doesn’t have one'), { status: 'not a handle', raw: 'Doesn’t have one' })
  assert.equal(parseHandle('').status, 'missing')
  assert.equal(parseHandle(undefined).status, 'missing')
})

test('splitAesName reads AES "Last, First"', () => {
  assert.deepEqual(splitAesName('BETA, ALEX'), { last: 'BETA', first: 'ALEX' })
  assert.deepEqual(splitAesName("O'Hare, Sam"), { last: "O'Hare", first: 'Sam' })
})

test('matchRoster matches within a team by name, then initial, and keeps coaches apart', () => {
  const players = [{ first: 'Theodore', last: 'Gamma' }, { first: 'Alex', last: 'beta' }, { first: 'Bob', last: 'Delta' }, { first: 'Pat', last: 'Late' }]
  const roster = [
    { FullName: 'Coach, Head', RoleOrJersey: 'Head Coach' },
    { FullName: 'BETA, ALEX', RoleOrJersey: '6' },
    { FullName: 'Gamma, Teddy', RoleOrJersey: '72' },
    { FullName: 'Delta, Robert', RoleOrJersey: '9' },
    { FullName: 'Omega, Extra', RoleOrJersey: '11' },
  ]
  const { matched, aesOnly, coaches } = matchRoster(players, roster)
  assert.deepEqual(matched.map(m => [m.aes?.jersey, m.how]), [
    ['72', 'last name + first initial'], ['6', 'name'], ['9', 'last name only'], [undefined, undefined],
  ])
  assert.deepEqual(aesOnly.map(a => a.jersey), ['11'])
  assert.deepEqual(coaches, [{ name: 'Head Coach', role: 'Head Coach' }])
})

test('matchRoster gives siblings their own rows before any fallback runs', () => {
  const players = [{ first: 'Alex', last: 'Smith' }, { first: 'Alexis', last: 'Smith' }]
  // Alexis's exact row comes first, where Alex's first-initial fallback would reach it.
  const roster = [{ FullName: 'Smith, Alexis', RoleOrJersey: '4' }, { FullName: 'Smith, Alexander', RoleOrJersey: '3' }]
  const { matched } = matchRoster(players, roster)
  assert.deepEqual(matched.map(m => [m.aes.jersey, m.how]), [['3', 'last name + first initial'], ['4', 'name']])
})

test('matchRoster leaves a shared last name unmatched when it cannot tell players apart', () => {
  const players = [{ first: 'Sam', last: 'Lee' }, { first: 'Jo', last: 'Lee' }]
  const { matched, aesOnly } = matchRoster(players, [{ FullName: 'Lee, Pat', RoleOrJersey: '5' }])
  assert.deepEqual(matched.map(m => m.aes), [undefined, undefined])
  assert.deepEqual(aesOnly.map(a => a.jersey), ['5'])
})

test('buildTagList prefers checked accounts, marks refusals, and never takes a parent handle', () => {
  const registrations = [
    reg(1, 'B18-1', 'Alex', 'Beta'),
    reg(2, 'B18-1', 'Sam', 'Gamma', { parentUserId: 90 }),
    reg(3, 'B18-1', 'Chris', 'Coach', { isStaff: true }),
    reg(4, 'B17-2', 'Jo', 'Eps'),
    reg(5, 'B16-1', 'Lee', 'Zeta', { registrationStatus: 'SPOT_PENDING' }),
    reg(6, 'B18-1', 'Kim', 'Other', { programId: 2 }),
    reg(7, 'B18-1', 'Max', 'Eta'),
  ]
  const members = [member(1, 'old_typo', 1), member(1, '@alex_typed', 2), member(2), member(90, 'parent_account'), member(4, 'jo.vb'), member(7, 'N/A')]
  const aesTeams = new Map([
    ['18-1', [{ FullName: 'Beta, Alex', RoleOrJersey: '6' }, { FullName: 'Gamma, Sam', RoleOrJersey: '7' }, { FullName: 'Coach, Chris', RoleOrJersey: 'Head Coach' }]],
  ])
  const checked = new Map([['18-1#6', { accounts: ['alex_real'], evidence: 'bio names 630', date: '2026-10-27' }]])
  const { players, coaches } = buildTagList({ registrations, members, programs: new Set([1]), aesTeams, checked, refused: { alex_real: '2026-10-27' } })

  assert.deepEqual(players.map(p => `${p.team} ${p.name}`), ['18-1 Alex Beta', '18-1 Sam Gamma', '18-1 Max Eta', '17-2 Jo Eps'])
  const [alex, sam, max, jo] = players
  assert.equal(alex.account, 'alex_real')
  assert.equal(alex.leagueappsHandle, 'alex_typed', 'latest member record wins')
  assert.equal(alex.check, 'checked 2026-10-27; LeagueApps says @alex_typed')
  assert.equal(alex.graph, 'refused 2026-10-27')
  assert.equal(sam.account, '')
  assert.equal(sam.flags, 'handle only on parent record (not used)')
  assert.equal(max.account, '')
  assert.equal(max.whatFamilyWrote, 'N/A')
  assert.equal(max.aes, 'not on AES roster')
  assert.equal(jo.account, 'jo.vb')
  assert.equal(jo.check, 'unchecked: LeagueApps registration field')
  assert.equal(jo.aes, 'team not on AES yet')
  assert.equal(coaches.length, 1)
})

function checkedFile(name, players) {
  const path = join(mkdtempSync(join(tmpdir(), 'people-tags-')), name)
  writeFileSync(path, JSON.stringify({ players }))
  utimesSync(path, new Date('2026-10-28T17:00:00Z'), new Date('2026-10-28T17:00:00Z'))
  return path
}

test('readChecked keeps a confirmed account over a later rejection and reads private and rejected verdicts', () => {
  const earlier = checkedFile('a.json', [{ team: '18-1', jersey: '6', account: 'alex_real', confidence: 'strong', evidence: 'bio names 630' }])
  const later = checkedFile('b.json', [
    { team: '18-1', jersey: '6', account: '', confidence: 'rejected', checked_handle: 'alex_typed', evidence: 'no such account' },
    { team: '18-1', jersey: '7', account: '@Sam.Priv', confidence: 'private', evidence: 'name matches' },
    { team: '18-1', jersey: '8', account: '', confidence: 'rejected', checked_handle: '@Max_Typo', evidence: 'no such account' },
    { team: '18-1', jersey: '9', account: 'someone', confidence: 'weak', evidence: 'unrelated' },
  ])
  const checked = readChecked([earlier, later])
  assert.deepEqual(checked.get('18-1#6').accounts, ['alex_real'])
  assert.deepEqual(checked.get('18-1#7'), { accounts: ['sam.priv'], evidence: 'name matches', date: '2026-10-28', private: true })
  assert.deepEqual(checked.get('18-1#8'), { accounts: [], rejected: 'max_typo', evidence: 'no such account', date: '2026-10-28' })
  assert.equal(checked.has('18-1#9'), false)
})

test('buildTagList drops only the rejected handle and marks private accounts for tagging by hand', () => {
  const registrations = [reg(1, 'B18-1', 'Sam', 'Gamma'), reg(2, 'B18-1', 'Max', 'Eta'), reg(3, 'B18-1', 'Lee', 'Zeta')]
  const members = [member(1, 'sam.priv'), member(2, 'max_typo'), member(3, 'lee_new')]
  const aesTeams = new Map([['18-1', [
    { FullName: 'Gamma, Sam', RoleOrJersey: '7' }, { FullName: 'Eta, Max', RoleOrJersey: '8' }, { FullName: 'Zeta, Lee', RoleOrJersey: '9' },
  ]]])
  const checked = new Map([
    ['18-1#7', { accounts: ['sam.priv'], evidence: '', date: '2026-10-28', private: true }],
    ['18-1#8', { accounts: [], rejected: 'max_typo', evidence: 'no such account', date: '2026-10-28' }],
    ['18-1#9', { accounts: [], rejected: 'lee_old', evidence: 'no such account', date: '2026-10-28' }],
  ])
  const [sam, max, lee] = buildTagList({ registrations, members, programs: new Set([1]), aesTeams, checked }).players
  assert.equal(sam.account, 'sam.priv')
  assert.equal(sam.graph, 'private: Graph cannot tag it; tag by hand in the app')
  assert.equal(max.account, '')
  assert.equal(max.check, 'rejected 2026-10-28: @max_typo no such account')
  assert.equal(max.leagueappsHandle, 'max_typo')
  assert.equal(lee.account, 'lee_new', 'a newly typed handle is not covered by the old rejection')
  assert.equal(lee.check, 'unchecked: LeagueApps registration field')
  assert.equal(lee.checkEvidence, '', 'the old rejection note does not follow the new handle')
})

test('a check made by name still applies after the player gets a jersey', () => {
  const checked = new Map([['15-1#name:annmarievale', { accounts: ['am_vb'], evidence: '', date: '2026-10-28' }]])
  const aesTeams = new Map([['15-1', [{ FullName: 'Vale, Ann Marie', RoleOrJersey: '14' }]]])
  const [row] = buildTagList({ registrations: [reg(1, 'B15-1', 'Ann Marie', 'Vale')], members: [member(1, 'am_vb')], programs: new Set([1]), aesTeams, checked }).players
  assert.equal(row.jersey, '14')
  assert.equal(row.check, 'checked 2026-10-28, matches LeagueApps')

  checked.set('15-1#14', { accounts: [], rejected: 'am_old', evidence: 'no such account', date: '2026-10-28' })
  const [again] = buildTagList({ registrations: [reg(1, 'B15-1', 'Ann Marie', 'Vale')], members: [member(1, 'am_vb')], programs: new Set([1]), aesTeams, checked }).players
  assert.equal(again.check, 'checked 2026-10-28, matches LeagueApps', 'a stale rejection under the jersey does not hide the name check')
})

test('a player not on an AES roster yet is matched to its check by team and name', () => {
  const path = checkedFile('c.json', [{ team: '15-1', jersey: '', name: 'Ann-Marie Vale', account: 'am_vb', confidence: 'strong', evidence: 'bio names 630' }])
  const checked = readChecked([path])
  const registrations = [reg(1, 'B15-1', 'Ann Marie', 'Vale')]
  const [row] = buildTagList({ registrations, members: [member(1, 'am_vb')], programs: new Set([1]), aesTeams: new Map([['15-1', []]]), checked }).players
  assert.equal(row.jersey, '')
  assert.equal(row.check, 'checked 2026-10-28, matches LeagueApps')
})

test('toCsv quotes cells with commas and prefixes accounts with @', () => {
  const csv = toCsv([{ team: '18-1', jersey: '6', name: 'Alex Beta', account: 'alex_real', check: 'checked 2026-10-27, matches LeagueApps', graph: '', aes: 'on AES roster', flags: '', otherAccounts: ['alex_alt'], whatFamilyWrote: '' }])
  assert.equal(csv.split('\n')[1], '18-1,6,Alex Beta,@alex_real,"checked 2026-10-27, matches LeagueApps",,on AES roster,,@alex_alt,')
})
