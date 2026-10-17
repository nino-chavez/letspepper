/** Read-only Instagram music search and access check. See SETUP.md. */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { searchAudio, getAudio, checkAudioAccess } from './instagram-audio.mjs'

try {
  const { values: args } = parseArgs({ options: {
    account: { type: 'string' }, query: { type: 'string' }, type: { type: 'string', default: 'music' },
    id: { type: 'string' }, limit: { type: 'string', default: '10' }, 'check-access': { type: 'boolean' },
  } })
  const accounts = JSON.parse(readFileSync(new URL('./accounts.json', import.meta.url))).accounts
  const account = accounts[args.account]
  if (!account) throw new Error('Required: --account <registered account slug>')
  const limit = Number(args.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('--limit must be from 1 to 100')
  if (args.id && (args.query || args['check-access'])) throw new Error('--id cannot be combined with --query or --check-access')
  const token = process.env.IG_ACCESS_TOKEN || (account.token_ref && execFileSync('op', ['read', account.token_ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim())
  if (!token) throw new Error('Set IG_ACCESS_TOKEN for this account; no token_ref is registered')
  const result = args['check-access'] ? await checkAudioAccess(token, account)
    : args.id ? await getAudio(token, account.ig_user_id, args.id)
    : { account: account.handle, checked_at: new Date().toISOString(), query: args.query || null, audio: (await searchAudio(token, account.ig_user_id, { query: args.query, type: args.type })).slice(0, limit) }
  console.log(JSON.stringify(result, null, 2))
  if (args['check-access'] && !result.ready_to_search) process.exitCode = 1
} catch (error) {
  // Never dump child-process errors (they may include credential-bearing output).
  console.error(error.cmd || error.stderr ? 'Could not read the account credential from 1Password' : error.message)
  process.exitCode = 1
}
