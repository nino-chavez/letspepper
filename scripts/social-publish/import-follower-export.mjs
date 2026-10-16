import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readExport, snapshotStatement } from './follower-snapshots.mjs'
import { d1Query } from './business-suite-import.mjs'

const {values} = parseArgs({ options: { directory: {type:'string'}, manifest: {type:'string'}, receipt: {type:'string'}, apply: {type:'boolean',default:false} } })
const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'))
function privatePath(path, existing = true) {
  if (!path) throw Error('Provide --directory, --manifest and --receipt, all outside the public repository')
  const absolute = existing ? realpathSync(path) : resolve(realpathSync(dirname(resolve(path))),resolve(path).split('/').at(-1))
  // Covers this checkout and the main checkout containing .worktrees.
  const main = repo.split('/.worktrees/')[0]
  const inside = relative(main,absolute)
  if (!inside.startsWith('../')) throw Error('Keep owner exports, manifests and receipts outside the public repository')
  return absolute
}
try {
  const directory = privatePath(values.directory), manifestPath = privatePath(values.manifest)
  const receiptPath = privatePath(values.receipt,false)
  if (existsSync(receiptPath)) throw Error('Choose a new receipt path; existing evidence is never overwritten')
  let manifest
  try { manifest = JSON.parse(readFileSync(manifestPath,'utf8')) } catch { throw Error('The manifest must contain valid JSON') }
  const snapshot = readExport(directory,manifest)
  const receipt = { mode: values.apply?'imported':'validated_only', snapshot_id: snapshot.snapshot_id, account: snapshot.account, exported_at: snapshot.exported_at, handle_count: snapshot.handle_count, checked_at: snapshot.imported_at, comparison: 'First snapshot is a baseline. Later snapshots show added and absent handles; absence does not establish cause.' }
  if (values.apply) {
    const config = { accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN, databaseId: 'c192b5be-8142-4695-a37f-e92eeb0a12a0' }
    await d1Query({...config,...snapshotStatement(snapshot)})
    const [saved] = await d1Query({...config,sql:'SELECT * FROM follower_handle_snapshots WHERE snapshot_id=?',params:[snapshot.snapshot_id]})
    if (!saved || saved.handles_json !== snapshot.handles_json || saved.provenance_json !== snapshot.provenance_json || saved.exported_at !== snapshot.exported_at) throw Error('Snapshot readback did not match; no success receipt written')
    receipt.imported_at = saved.imported_at
    receipt.readback_verified = true
  }
  writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'})
  console.log(`${values.apply?'Imported and verified':'Validated only'}: ${snapshot.handle_count} handles, export ${snapshot.exported_at}. Receipt: ${receiptPath}`)
} catch(error) { console.error(error.message); process.exitCode = 1 }
