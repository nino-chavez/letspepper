import test from 'node:test'
import assert from 'node:assert/strict'
import {seeded,NOW,PASSPHRASE} from './fixtures.mjs'
import {loadStoryLedger,compareStories,LEDGER_SQL} from '../src/story-ledger.js'
import {centralMidnight} from '../src/story-time.js'
import {storyLedgerPage} from '../src/story-ledger-page.js'
import {validateStoryLabel,labelStatement} from '../../story-labels.mjs'
import {sessionCookie} from '../src/auth.js'
import worker from '../src/index.js'
const label={media_id:'123',title:'Example community Story',content_kind:'player_community',source:'Owner identified the saved preview'}
test('labels require source, stay separate from previews and cannot relabel another account or a feed post',()=>{
 const db=seeded();db.sqlite.prepare("INSERT INTO media VALUES ('123','630','2026-10-15T18:00:00Z','VIDEO','STORY',NULL,'now','now',NULL)").run()
 const l=validateStoryLabel(label),s=labelStatement(l,NOW.toISOString());db.sqlite.prepare(s.sql).run(...s.params);assert.equal(db.sqlite.prepare("SELECT title FROM story_content WHERE media_id='123'").get().title,label.title)
 for(const x of [{...label,source:''},{...label,content_kind:'popular'},{...label,slide_position:2},{...label,elements:['invented']},{...label,extra:'no'}])assert.throws(()=>validateStoryLabel(x))
 const other=labelStatement({...l,media_id:'p1'},NOW.toISOString());db.sqlite.prepare(other.sql).run(...other.params);assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM story_content WHERE media_id='p1'").get().n,0)
})
test('Central dates respect daylight-saving transitions',()=>{
 assert.equal(centralMidnight('2026-11-01'),'2026-11-01T05:00:00');assert.equal(centralMidnight('2026-11-02'),'2026-11-02T06:00:00');assert.equal(centralMidnight('2026-03-08'),'2026-03-08T06:00:00');assert.equal(centralMidnight('2026-03-09'),'2026-03-09T05:00:00')
})
test('ledger retains expired identities and compares only paired readings at 22–24h',async()=>{
 const db=seeded(),insert=db.sqlite.prepare('INSERT INTO story_metric_observations VALUES (?,?,?,?)')
 for(const [at,reach,interactions] of [['2026-10-16T11:00:00Z',100,20],['2026-10-16T17:00:00Z',200,30],['2026-10-16T18:30:00Z',300,60]]){insert.run('s1','reach',at,reach);insert.run('s1','total_interactions',at,interactions)}
 const data=await loadStoryLedger(db,new URLSearchParams({from:'2026-10-01',to:'2026-10-16'}),NOW);assert.equal(data.total,2);assert.equal(data.rows.find(r=>r.media_id==='s1').metrics.reach.value,120);assert.equal(data.comparisonCount,1);assert.equal(data.comparisons.kind[0].reach,200);assert.equal(data.comparisons.kind[0].actionsPer100,15)
 const html=storyLedgerPage(data);assert.match(html,/Unclassified/);assert.match(html,/Preview not captured/);assert.match(html,/22–24 hours/);assert.match(html,/Not enough eligible Stories to compare yet/)
 await assert.rejects(loadStoryLedger(db,new URLSearchParams({from:'2020-01-01',to:'2026-01-01'}),NOW),RangeError)
 for(const sql of Object.values(LEDGER_SQL))assert.match(sql,/^SELECT/)
 const zero=compareStories([{published_at:'2026-10-15T18:00:00Z',reach:0,interactions:0}],'kind')[0];assert.equal(zero.actionsPer100,null)
})
test('private previews require sign-in, reject unsafe IDs and never redirect to a CDN',async()=>{
 const db=seeded();db.sqlite.prepare("INSERT INTO media VALUES ('123','630','2026-10-15T18:00:00Z','VIDEO','STORY',NULL,'now','now',NULL)").run();db.sqlite.prepare("INSERT INTO story_content(media_id,preview_key,preview_status) VALUES ('123','630/123/preview','saved')").run()
 let gets=0;const env={INSIGHTS_DB:db,DASHBOARD_PASSPHRASE:PASSPHRASE,STORY_ARCHIVE:{get:async()=>{gets++;return {body:'image',httpMetadata:{contentType:'image/jpeg'}}}}}
 const req=(path,cookie)=>worker.fetch(new Request('https://dash.test'+path,{headers:cookie?{cookie}:{}}),env)
 assert.match(await(await req('/story-preview/123')).text(),/Passphrase/);assert.equal(gets,0)
 const cookie=(await sessionCookie(PASSPHRASE)).split(';')[0];const response=await req('/story-preview/123',cookie);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(await response.text(),'image');assert.equal((await req('/story-preview/../../foo',cookie)).status,404)
 const page=await req('/story-ledger',cookie);assert.equal(page.status,200);assert.match(await page.text(),/Remember what each Story was/)
})
