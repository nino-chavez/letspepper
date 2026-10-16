import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { reportSql, validateReport, sourceRange, dailySeries, postSnapshot, IG_ID } from '../business-suite-report.mjs'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
// All numbers, captions and links in these tests are invented.
const url='https://business.facebook.com/latest/insights/results?'+new URLSearchParams({business_id:'315859855990883',asset_id:'569987303404898',platform:'Instagram',time_range:encodeURIComponent(JSON.stringify({start:'2026-10-01',end:'2026-10-02'}))})
const capture=()=>({url,captured_at:'2026-10-03T14:00:00Z',text:'\nInstagram\nOct 1, 2026 – Oct 2, 2026',tables:Array.from({length:6},()=> '\t1790838000\t1790924400\nPrimary\t10\t0')})
const report=()=>({version:1,account:'630',instagram_id:IG_ID,captured_at:'2026-10-03T14:00:00Z',through_day:'2026-10-02',daily:[{day:'2026-10-01',metric:'reach',value:10,observed_at:'2026-10-03T14:00:00Z'}],periods:[{start:'2026-10-01',end:'2026-10-02',days:2,reach_rounded:false,metrics:{unique_reach:11}}],snapshot:{posts:Array.from({length:12},(_,i)=>({identity_key:'invented-'+i}))}})
test('chart parsing keeps observed zero and verifies rendered dates/platform and asset',()=>{
 assert.equal(dailySeries(capture()).length,12)
 assert.equal(dailySeries(capture())[1].value,0)
 for(const change of [x=>x.text=x.text.replace('Instagram','Facebook'),x=>x.url=x.url.replace('569987303404898','123'),x=>x.text=x.text.replace('Oct 2','Oct 3')]){const x=capture();change(x);assert.throws(()=>sourceRange(x))}
 const x=capture();x.tables[0]='\t1790838000\nPrimary\t10\t1';assert.throws(()=>dailySeries(x),/Invalid chart/)
})
test('report validation rejects duplicate days, invalid values and incomplete snapshots',()=>{
 assert.equal(validateReport(report()).account,'630')
 for(const change of [x=>x.daily.push(x.daily[0]),x=>x.daily[0].value=null,x=>x.snapshot.posts.pop(),x=>x.instagram_id='wrong',x=>x.periods[0].days=3]){const r=report();change(r);assert.throws(()=>validateReport(r))}
})
test('real SQLite schema imports rerun safely, preserve API rows and reject older revisions',()=>{
 const db=new DatabaseSync(':memory:');db.exec(read('../worker/migrations/0001_instagram_insights.sql'));db.exec(read('../worker/migrations/0003_business_suite_reports.sql'))
 db.exec("INSERT INTO account_metric_days VALUES ('630','2026-10-01','reach',8,'graph_api','t','t')")
 const r=report();db.exec(reportSql(r));db.exec(reportSql(r))
 assert.equal(db.prepare('SELECT COUNT(*) n FROM business_suite_reports').get().n,1)
 r.captured_at='2026-10-04T14:00:00Z';r.daily[0].value=12;r.daily[0].observed_at=r.captured_at;db.exec(reportSql(r))
 db.exec(reportSql(report()))
 assert.equal(db.prepare("SELECT value FROM account_metric_days WHERE source='business_suite'").get().value,12)
 r.captured_at='2026-10-05T14:00:00Z';r.daily=[];db.exec(reportSql(r))
 assert.equal(db.prepare("SELECT value FROM account_metric_days WHERE source='business_suite'").get().value,12)
 assert.equal(db.prepare("SELECT value FROM account_metric_days WHERE source='graph_api'").get().value,8)
 assert.equal(JSON.parse(db.prepare('SELECT report_json FROM business_suite_reports ORDER BY captured_at DESC LIMIT 1').get().report_json).periods[0].metrics.unique_reach,11)
})
test('post identity survives control labels changing; wrong filter refuses import',()=>{
 const c={...capture(),filter:'Instagram Feed',sort:'descending',rows:Array.from({length:12},(_,i)=>({cells:[`Invented caption ${i}\nReel\n630volleyball\nBoost\nOpen Dropdown\n​`,'Thu Oct 1, 12:00pm',String(100-i),'10','--','3','2','1','0','0','--','--','--','--','2s'],links:[]}))}
 const first=postSnapshot(c);c.rows[0].cells[0]=c.rows[0].cells[0].replace('\nBoost','');const second=postSnapshot(c,first.posts)
 assert.equal(first.posts[0].identity_key,second.posts[0].identity_key)
 c.filter='All content';assert.throws(()=>postSnapshot(c),/filter/)
})

test('a missing ranked views cell fails rather than promoting the thirteenth post',()=>{
 const c={...capture(),filter:'Instagram Feed',sort:'descending',rows:Array.from({length:13},(_,i)=>({cells:[`Caption ${i}\nReel\n630volleyball`,'Thu Oct 1, 12:00pm',i===0?'--':String(100-i),'10','--','3','2','1','0','0','--','--','--','--','2s']}))}
 assert.throws(()=>postSnapshot(c),/numeric views/)
})

test('retained post metrics keep their earlier reading time',()=>{
 const c={...capture(),filter:'Instagram Feed',sort:'descending',rows:Array.from({length:12},(_,i)=>({cells:[`Caption ${i}\nReel\n630volleyball`,'Thu Oct 1, 12:00pm',String(100-i),'10','--','3','2','1','4','0','--','--','--','--','2s']}))}
 const old=postSnapshot(c);c.captured_at='2026-10-04T14:00:00Z';c.rows[0].cells[8]='--';const fresh=postSnapshot(c,old.posts)
 assert.equal(fresh.posts[0].metrics.shares,4)
 assert.equal(fresh.posts[0].metric_observed_at.shares,old.observed_at)
 assert.deepEqual(fresh.posts[0].retained_metrics,['shares'])
})
