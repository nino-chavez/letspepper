import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeSnapshot, readExport, snapshotStatement } from '../../follower-snapshots.mjs'
import { loadFollowerSnapshots } from '../src/follower-snapshots.js'
import { followerSnapshotsPage } from '../src/follower-snapshots-page.js'
import { sessionCookie } from '../src/auth.js'
import worker from '../src/index.js'
import { fakeD1, PASSPHRASE } from './fixtures.mjs'

// Invented handles only. The real owner export still needs its own acceptance run.
const manifest = {version:1,account:'630volleyball',source:'instagram_accounts_center',date_range:'all_time',format:'json',account_verified:true,all_parts_verified:true,exported_at:'2026-10-01T12:00:00Z',follower_files:['followers_1.json']}
const file = (handles,name='followers_1.json') => ({name,text:JSON.stringify(handles.map(value=>({title:'',string_list_data:[{value,href:`https://www.instagram.com/${value}/`,timestamp:123}]})))})
const snapshot = (handles,date=manifest.exported_at) => makeSnapshot({...manifest,exported_at:date},[file(handles)],'2026-10-16T18:00:00.000Z')
function database() {
  const db=fakeD1()
  db.sqlite.exec(readFileSync(new URL('../../worker/migrations/0004_follower_handle_snapshots.sql',import.meta.url),'utf8'))
  return db
}
function insert(db,row) { const s=snapshotStatement(row);db.sqlite.prepare(s.sql).run(...s.params) }

test('all follower parts normalize and bind without exposing handles in SQL',()=>{
  const m={...manifest,follower_files:['followers_1.json','followers_2.json']}
  const result=makeSnapshot(m,[file(['Example_Alpha']),file(['example.beta'],'followers_2.json')])
  assert.deepEqual(JSON.parse(result.handles_json),['example.beta','example_alpha'])
  assert.equal(JSON.parse(result.provenance_json).files.length,2)
  assert.equal(result.handle_count,2)
  assert.doesNotMatch(snapshotStatement(result).sql,/example/i)
  assert.equal(snapshotStatement(result).params[5],result.handles_json)
})

test('unverified, partial, duplicate, empty, malformed and conflicting exports fail closed',()=>{
  for(const changed of [{account:'someone_else'},{account_verified:false},{all_parts_verified:false},{date_range:'last_year'},{format:'html'},{exported_at:'tomorrow'},{exported_at:'2026-02-30T00:00:00Z'},{exported_at:'2099-01-01T00:00:00Z'},{follower_files:['followers_1.json','followers_2.json']}]) assert.throws(()=>makeSnapshot({...manifest,...changed},[file(['example_a'])]))
  for(const handles of [[],['example_a','EXAMPLE_A'],['<script>'],['bad handle']]) assert.throws(()=>makeSnapshot(manifest,[file(handles)]))
  assert.throws(()=>makeSnapshot(manifest,[{name:'followers_1.json',text:JSON.stringify({relationships_following:[]})}]),/Unsupported/)
  assert.throws(()=>makeSnapshot(manifest,[{name:'followers_1.json',text:'{private_example_handle'}]),error=>error.message==='Invalid JSON in follower file: followers_1.json')
  assert.throws(()=>makeSnapshot(manifest,[{name:'followers_1.json',text:JSON.stringify([{string_list_data:[{value:'example_a',href:'https://example.test/example_a/'}]}])}]),/Mismatched/)
  assert.throws(()=>makeSnapshot({...manifest,follower_files:['followers_1.json','followers_3.json']},[file(['example_a']),file(['example_b'],'followers_3.json')]),/Missing/)
  const db=database(), first=snapshot(['example_a'])
  insert(db,first);insert(db,first)
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM follower_handle_snapshots').get().n,1)
  assert.throws(()=>insert(db,snapshot(['example_b'])),/UNIQUE/)
  assert.equal(db.sqlite.prepare('SELECT handles_json FROM follower_handle_snapshots').get().handles_json,first.handles_json)
})

test('directory scan includes all follower parts and ignores following data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'follower-fixture-'))
  try {
    mkdirSync(join(dir,'connections'))
    writeFileSync(join(dir,'connections/followers_1.json'),file(['example_a']).text)
    writeFileSync(join(dir,'connections/following.json'),'not follower data')
    const m={...manifest,follower_files:['connections/followers_1.json']}
    assert.equal(readExport(dir,m).handle_count,1)
    writeFileSync(join(dir,'connections/followers_2.json'),file(['example_b']).text)
    assert.throws(()=>readExport(dir,m),/inventory/)
  } finally {rmSync(dir,{recursive:true,force:true})}
})

test('no table, no export, baseline and later comparisons are distinct',async()=>{
  assert.equal((await loadFollowerSnapshots(fakeD1())).state,'unavailable')
  const db=database()
  assert.equal((await loadFollowerSnapshots(db)).state,'empty')
  const first=snapshot(['example_a','example_b']);insert(db,first)
  const baseline=await loadFollowerSnapshots(db)
  assert.equal(baseline.state,'baseline');assert.equal(baseline.counts.added,null);assert.equal(baseline.counts.absent,null)
  insert(db,snapshot(['example_b','example_c'],'2026-10-08T12:00:00Z'))
  const later=await loadFollowerSnapshots(db,new URLSearchParams({filter:'absent'}))
  assert.equal(later.state,'comparison');assert.deepEqual(later.counts,{all:2,added:1,absent:1,retained:1});assert.deepEqual(later.handles,['example_a'])
  const added=await loadFollowerSnapshots(db,new URLSearchParams({filter:'added'}));assert.deepEqual(added.handles,['example_c'])
  const historical=await loadFollowerSnapshots(db,new URLSearchParams({snapshot:first.snapshot_id,filter:'added'}))
  assert.equal(historical.state,'baseline');assert.equal(historical.filter,'all')
  const page=followerSnapshotsPage(later)
  assert.match(page,/1 added\. 1 absent/);assert.match(page,/does not prove why/);assert.match(page,/does not retrieve follower lists/)
})

test('search and pagination stay bounded; identical lists produce zero changes',async()=>{
  const db=database(), handles=Array.from({length:225},(_,i)=>`example_${String(i).padStart(3,'0')}`)
  insert(db,snapshot(handles));insert(db,snapshot(handles,'2026-10-08T12:00:00Z'))
  const data=await loadFollowerSnapshots(db,new URLSearchParams({p:'99'}))
  assert.equal(data.page,3);assert.equal(data.handles.length,25);assert.equal(data.counts.added,0);assert.equal(data.counts.absent,0)
  const found=await loadFollowerSnapshots(db,new URLSearchParams({q:'@example_224'}));assert.deepEqual(found.handles,['example_224'])
  const hostile=await loadFollowerSnapshots(db,new URLSearchParams({q:'<script>alert(1)</script>'}))
  assert.doesNotMatch(followerSnapshotsPage(hostile),/<script>alert\(1\)/)
})

test('follower route requires a valid session and reads only SELECTs',async()=>{
  const db=database();insert(db,snapshot(['example_private']))
  const env={INSIGHTS_DB:db,DASHBOARD_PASSPHRASE:PASSPHRASE}
  const anon=await worker.fetch(new Request('https://dashboard.test/followers'),env)
  assert.doesNotMatch(await anon.text(),/example_private/)
  const cookie=(await sessionCookie(PASSPHRASE)).split(';')[0]
  const queries=[], original=db.prepare
  db.prepare=sql=>{queries.push(sql);return original(sql)}
  const response=await worker.fetch(new Request('https://dashboard.test/followers',{headers:{cookie}}),env)
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
  assert.match(await response.text(),/example_private/)
  assert.ok(queries.length);for(const sql of queries)assert.match(sql,/^SELECT /)
  const bad=await worker.fetch(new Request('https://dashboard.test/followers',{headers:{cookie:cookie+'bad'}}),env)
  assert.doesNotMatch(await bad.text(),/example_private/)
})
