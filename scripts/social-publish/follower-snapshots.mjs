import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { resolve, relative, basename } from 'node:path'

const sha = value => createHash('sha256').update(value).digest('hex')
const followerFile = name => /^followers(?:_[1-9]\d*)?\.json$/.test(name)
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z','Z') === value.replace('.000Z','Z')

// Export completeness and account ownership are checked in Accounts Center by the
// importer, not inferred from a follower array (which contains no owning account).
export function makeSnapshot(manifest, files, importedAt = new Date().toISOString()) {
  if (manifest?.version !== 1 || manifest.account !== '630volleyball' || manifest.source !== 'instagram_accounts_center') throw Error('Use an Accounts Center export verified for 630volleyball')
  if (manifest.date_range !== 'all_time' || manifest.format !== 'json' || manifest.account_verified !== true || manifest.all_parts_verified !== true) throw Error('Verify the account, all-time JSON selection, and every export part before importing')
  if (!timestamp(manifest.exported_at) || !timestamp(importedAt) || Date.parse(manifest.exported_at) > Date.parse(importedAt)) throw Error('Use the export preparation timestamp in UTC; it cannot be in the future')
  if (!Array.isArray(manifest.follower_files) || !manifest.follower_files.length || new Set(manifest.follower_files).size !== manifest.follower_files.length) throw Error('List every follower file exactly once in the manifest')
  const names = files.map(f => f.name).sort()
  if (JSON.stringify(names) !== JSON.stringify([...manifest.follower_files].sort()) || names.some(n => !followerFile(basename(n)))) throw Error('Follower file inventory does not match the reviewed manifest')
  const parts = names.map(n => Number(basename(n).match(/_(\d+)\./)?.[1] ?? 1)).sort((a,b) => a-b)
  if (parts.some((n,i) => n !== i+1)) throw Error('Missing or duplicate numbered follower part')
  const handles = new Set(), evidence = []
  for (const file of [...files].sort((a,b) => a.name.localeCompare(b.name))) {
    let parsed
    try { parsed = JSON.parse(file.text) } catch { throw Error(`Invalid JSON in follower file: ${file.name}`) }
    const rows = Array.isArray(parsed) ? parsed : parsed?.relationships_followers
    if (!Array.isArray(rows)) throw Error(`Unsupported follower JSON structure: ${file.name}`)
    for (const row of rows) {
      if (!Array.isArray(row.string_list_data) || row.string_list_data.length !== 1) throw Error(`Malformed follower entry: ${file.name}`)
      const record = row.string_list_data[0]
      const handle = typeof record.value === 'string' ? record.value.toLowerCase() : ''
      if (!/^[a-z0-9_.]{1,30}$/.test(handle)) throw Error(`Invalid handle in ${file.name}`)
      if (record.href) {
        const url = new URL(record.href)
        const path = url.pathname.replace(/^\/_u\//,'/').replace(/^\/|\/$/g,'').toLowerCase()
        if (url.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(url.hostname) || path !== handle) throw Error(`Mismatched profile URL in ${file.name}`)
      }
      if (handles.has(handle)) throw Error(`Duplicate handle in export; review its parts before importing`)
      handles.add(handle)
    }
    evidence.push({ name: file.name, sha256: sha(file.text), entries: rows.length })
  }
  if (!handles.size) throw Error('Empty export cannot establish a baseline for this account')
  const sorted = [...handles].sort(), handlesJson = JSON.stringify(sorted)
  if (Buffer.byteLength(handlesJson) > 1500000) throw Error('Snapshot exceeds the supported single-value size')
  const exportedAt = new Date(manifest.exported_at).toISOString()
  const sourceDigest = sha(JSON.stringify(evidence))
  return { snapshot_id: sha(`630volleyball\n${exportedAt}\n${sourceDigest}`), account: '630volleyball', exported_at: exportedAt, imported_at: importedAt, handle_count: sorted.length, handles_json: handlesJson, provenance_json: JSON.stringify({ source: manifest.source, date_range: manifest.date_range, format: manifest.format, account_verified: true, all_parts_verified: true, files: evidence, source_digest: sourceDigest }) }
}

export function readExport(directory, manifest) {
  const root = realpathSync(directory), files = []
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isSymbolicLink()) throw Error('Export directories cannot contain symbolic links')
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && followerFile(entry.name)) files.push({ name: relative(root,path).split('\\').join('/'), text: readFileSync(path,'utf8') })
    }
  }
  visit(root)
  return makeSnapshot(manifest, files)
}

export function snapshotStatement(snapshot) {
  const keys = ['snapshot_id','account','exported_at','imported_at','handle_count','handles_json','provenance_json']
  return { sql: `INSERT INTO follower_handle_snapshots (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')}) ON CONFLICT(snapshot_id) DO NOTHING`, params: keys.map(key => snapshot[key]) }
}
