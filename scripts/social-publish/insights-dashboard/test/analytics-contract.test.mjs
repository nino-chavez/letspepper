import test from 'node:test'
import assert from 'node:assert/strict'
import { instagramWindow, reportingWindow, summarizeInstagramDays, readWebsiteSummary, websiteAnswer, websiteSummaryQuery, METRIC_DEFINITIONS } from '../../analytics-contract.mjs'

test('dates follow the calendar rather than a late collector, including DST', () => {
  const w=instagramWindow({now:new Date('2026-10-16T18:00:00Z')})
  assert.equal(w.start,'2026-10-07');assert.equal(w.end,'2026-10-13')
  assert.equal(reportingWindow({now:new Date('2026-11-02T18:00:00Z')}).start,'2026-10-26')
  assert.equal(reportingWindow({now:new Date('2026-11-02T18:00:00Z')}).end,'2026-11-01')
  assert.throws(()=>websiteSummaryQuery({start:'2026-02-30',end:'2026-03-01'}))
})
test('missing and invalid flows stay unavailable while independent complete counts survive', () => {
  const days=['2026-10-01','2026-10-02']
  const rows=[{day:days[0],metric:'follows_and_unfollows:FOLLOWER',value:0},{day:days[1],metric:'follows_and_unfollows:FOLLOWER',value:3},{day:days[0],metric:'follows_and_unfollows:NON_FOLLOWER',value:1}]
  const s=summarizeInstagramDays({rows,days})
  assert.equal(s.summary.follows,3);assert.equal(s.summary.unfollows,null);assert.equal(s.summary.net,null)
  assert.equal(s.followerInsight.state,'incomplete');assert.deepEqual(s.coverage.unfollows.missing,[days[1]])
  for(const value of [null,'0',-1,0.5]) assert.equal(summarizeInstagramDays({rows:[{day:days[0],metric:'reach',value}],days:[days[0]]}).summary.typical,null)
  assert.throws(()=>summarizeInstagramDays({rows:[...rows,{...rows[0],value:9}],days}),/Conflicting/)
})
test('reach is median, follower flow is sum, and zero baseline has no percentage', () => {
  const days=['2026-10-02','2026-10-03','2026-10-04'],previousDays=['2026-09-29','2026-09-30','2026-10-01']
  const rows=[...days,...previousDays].flatMap((day,i)=>[
    {day,metric:'reach',value:i<3?[10,1000,20][i]:0},
    {day,metric:'follows_and_unfollows:FOLLOWER',value:4},
    {day,metric:'follows_and_unfollows:NON_FOLLOWER',value:1}])
  const s=summarizeInstagramDays({rows,days,previousDays})
  assert.equal(s.summary.typical,20);assert.equal(s.summary.follows,12);assert.equal(s.summary.net,9)
  assert.equal(s.summary.ratio,null);assert.equal(s.followerInsight.state,'comparison')
})
test('PostHog errors, absent result tables and impossible subsets cannot pass as zeros', () => {
  const columns=['visits','handoff_visits','instagram_visits','instagram_handoff_visits']
  for(const data of [{error:'timeout'},{columns,results:[]},{columns,results:[[10,11,2,1]]},{columns,results:[[10,3,2,3]]},{columns,results:[[null,0,0,0]]}]) assert.throws(()=>readWebsiteSummary(data))
  const zero=readWebsiteSummary({columns,results:[[0,0,0,0]]})
  assert.equal(websiteAnswer(zero).handoffRate,null);assert.equal(websiteAnswer(null).state,'incomplete')
  assert.equal(websiteAnswer(readWebsiteSummary({columns,results:[[100,20,10,4]]})).instagramHandoffRate,0.4)
  assert.match(METRIC_DEFINITIONS['website.handoff_sessions'].limit,/does not prove a completed registration/)
})
