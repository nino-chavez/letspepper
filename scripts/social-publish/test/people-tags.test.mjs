import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHandle, splitAesName, matchRoster, buildTagList, toCsv, HANDLE_FIELD } from '../people-tags.mjs'

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

test('toCsv quotes cells with commas and prefixes accounts with @', () => {
  const csv = toCsv([{ team: '18-1', jersey: '6', name: 'Alex Beta', account: 'alex_real', check: 'checked 2026-10-27, matches LeagueApps', graph: '', aes: 'on AES roster', flags: '', otherAccounts: ['alex_alt'], whatFamilyWrote: '' }])
  assert.equal(csv.split('\n')[1], '18-1,6,Alex Beta,@alex_real,"checked 2026-10-27, matches LeagueApps",,on AES roster,,@alex_alt,')
})
