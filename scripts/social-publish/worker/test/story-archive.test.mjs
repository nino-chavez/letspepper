import test from 'node:test'
import assert from 'node:assert/strict'
import {archiveStoryPreviews,previewURL,MAX_PREVIEW_BYTES} from '../src/story-archive.js'
import {fakeD1} from '../../insights-dashboard/test/fixtures.mjs'
function database(){const db=fakeD1();db.sqlite.prepare("INSERT INTO media VALUES ('123','630','2026-10-01T00:00:00Z','VIDEO','STORY',NULL,'now','now',NULL)").run();return db}
const story={id:'123',media_type:'VIDEO',thumbnail_url:'https://s.cdninstagram.com/preview.jpg'}
const invoke=(db,extra={})=>archiveStoryPreviews({db,bucket:{put:async()=>{}},media:[story],account:'630',observedAt:'2026-10-01T00:01:00Z',fetchImpl:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}}),...extra})
test('saves private bytes once, keeps labels and never stores expiring URLs',async()=>{
 const db=database();db.sqlite.prepare("INSERT INTO story_content(media_id,title,label_source) VALUES ('123','Example title','owner confirmation')").run();let puts=0
 assert.deepEqual(await invoke(db,{bucket:{put:async(key,bytes)=>{assert.equal(key,'630/123/preview');assert.equal(bytes.byteLength,3);puts++}}}),[])
 const row=db.sqlite.prepare('SELECT * FROM story_content').get();assert.equal(row.title,'Example title');assert.equal(row.preview_status,'saved');assert.match(row.preview_sha256,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes('cdninstagram'))
 await invoke(db,{fetchImpl:()=>assert.fail('must not fetch saved preview')});assert.equal(puts,1)
})
test('rejects foreign hosts, nonimages, redirect failures and oversized previews without losing Story records',async()=>{
 for(const url of ['http://s.cdninstagram.com/a','https://cdninstagram.com.attacker.test/a','https://s.cdninstagram.com:444/a'])assert.throws(()=>previewURL({...story,thumbnail_url:url}))
 for(const response of [new Response('<html>',{headers:{'content-type':'text/html'}}),new Response('x',{headers:{'content-type':'image/jpeg','content-length':String(MAX_PREVIEW_BYTES+1)}}),new Response(new Uint8Array(MAX_PREVIEW_BYTES+1),{headers:{'content-type':'image/jpeg'}})]) {
  const db=database();const failures=await invoke(db,{fetchImpl:async()=>response});assert.equal(failures.length,1);assert.equal(db.sqlite.prepare('SELECT preview_status FROM story_content').get().preview_status,'failed')
 }
 const failures=await invoke(database(),{fetchImpl:async()=>{throw Error('signed secret CDN URL')}});assert.ok(!JSON.stringify(failures).includes('secret'))
})
test('missing source preview stays unavailable and failed previews can retry',async()=>{
 const db=database();await invoke(db,{media:[{...story,thumbnail_url:null}]});assert.equal(db.sqlite.prepare('SELECT preview_status FROM story_content').get().preview_status,'unavailable');await invoke(db);assert.equal(db.sqlite.prepare('SELECT preview_status FROM story_content').get().preview_status,'saved')
})
