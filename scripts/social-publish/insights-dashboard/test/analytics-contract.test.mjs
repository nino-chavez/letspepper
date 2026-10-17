import test from 'node:test'
import assert from 'node:assert/strict'
import { instagramWindow, reportingWindow, summarizeInstagramDays, readWebsiteSummary, websiteAnswer, websiteSummaryQuery, websiteInsightQuery, METRIC_DEFINITIONS } from '../../analytics-contract.mjs'

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

test('saved PostHog answer uses the canonical counts and guidance', () => {
  const query=websiteInsightQuery({start:'2026-10-09',end:'2026-10-15'})
  assert.ok(query.includes(websiteSummaryQuery({start:'2026-10-09',end:'2026-10-15'})))
  const answer=websiteAnswer({visits:0,handoff_visits:0,instagram_visits:0,instagram_handoff_visits:0})
  assert.ok(query.includes(answer.action))
  assert.match(query,/AS answer/);assert.match(query,/AS next_step/)
})

// Invented participant rows; never use private exports as fixtures.
const registrations = await import('../../analytics-contract.mjs')
const registrationWindow = registrations.reportingWindow({ now: '2026-10-16T17:00:00Z' })
const participant = (id, extra = {}) => ({ id, registrationId: id, userId: id, programId: 5121761, masterProgramId: 5121753, programType: 'CLASS', created: Date.parse('2026-10-09T05:00:00Z'), lastUpdated: id, isStaff: 0, deleted: false, role: 'FREEAGENT', registrationStatus: 'SPOT_RESERVED', paymentStatus: 'PAID', ...extra })
test('registration rollup counts participant registrations by Central creation day and current status', () => {
  const r = registrations.createRegistrationRollup(registrationWindow)
  for (const row of [participant(1), participant(1), participant(2, { registrationStatus:'SPOT_PENDING' }), participant(3, { registrationStatus:'WAITING_LIST' }), participant(4,{paymentStatus:'VOID'}), participant(5,{paymentStatus:'REFUND'}), participant(6,{isStaff:1}), participant(7,{deleted:true}), participant(8,{role:'Tournament Team Registration'}), participant(9,{created:Date.parse('2026-10-09T04:59:59Z')}), participant(10,{created:Date.parse('2026-10-16T05:00:00Z')}), participant(11,{registrationStatus:'UNKNOWN'}), participant(12,{paymentStatus:'UNPAID'})]) r.add(row)
  const result = r.finish('2026-10-16T17:00:00Z')
  assert.deepEqual(result.current,{reserved:2,pending:1,waitlist:1,excluded:2,other:1})
  assert.equal(result.previous.reserved,1)
  r.add(participant(1,{deleted:true,lastUpdated:100}))
  r.add(participant(1,{lastUpdated:1}))
  assert.equal(r.finish().current.reserved,1)
  assert.match(registrations.registrationAnswer(result).heading,/2 bookings; 2 distinct athletes/)
  assert.throws(()=>r.add(participant(13,{isStaff:undefined})),/flags/)
  assert.throws(()=>r.add(participant(14,{created:null})),/fields/)
})
test('empty verified export is zero; incomplete and malformed snapshots are unavailable', () => {
  assert.equal(registrations.registrationAnswer(null).state,'unavailable')
  const empty = registrations.createRegistrationRollup(registrationWindow).finish()
  assert.match(registrations.registrationAnswer(empty).heading,/0 bookings; 0 distinct athletes/)
  empty.current.reserved = null
  assert.equal(registrations.registrationAnswer(empty).state,'unavailable')
})
test('LeagueApps paging follows short pages and inclusive cursor, refuses truncation or regression', async () => {
  const pages = [[participant(1)],[participant(1),participant(2)],[participant(2)]]
  const seen=[]
  assert.deepEqual(await registrations.walkLeagueAppsExport(async()=>pages.shift(),r=>seen.push(r.id)),{rowsRead:2,pages:3})
  assert.deepEqual(seen,[1,2])
  await assert.rejects(registrations.walkLeagueAppsExport(async()=>[participant(1)],()=>{},{maxPages:1}),/incomplete/)
  const backwards=[[participant(2)],[participant(1)]]
  await assert.rejects(registrations.walkLeagueAppsExport(async()=>backwards.shift(),()=>{}),/advance/)
  await assert.rejects(registrations.walkLeagueAppsExport(async()=>({error:'bad'}),()=>{}),/array/)
})
test('published snapshot allowlist never includes identities or raw rows', () => {
  const sample=registrations.createRegistrationRollup(registrationWindow).finish('2026-10-16T17:00:00Z')
  sample.email='private@example.invalid'; sample.rows=[{userId:123}]
  const props=registrations.registrationSnapshotProperties(sample,'cron')
  assert.equal(props.$process_person_profile,false)
  assert.equal(props.trigger,'cron')
  assert.equal(props.current_reserved,0)
  assert.doesNotMatch(JSON.stringify(props),/private@|userId|rows|registrationId/)
  assert.match(registrations.registrationInsightQuery(),/formatDateTime\(max\(timestamp\), '%Y-%m-%d %H:%i:%S', 'UTC'\)/)
  assert.match(registrations.registrationInsightQuery(),/36 HOUR/)
  assert.match(registrations.registrationInsightQuery(),/period_start =/)
  assert.match(registrations.registrationInsightQuery(),/Missing data does not mean zero/)
})

test('bookings, setup, commitments and unknown programs reconcile without counting sessions as athletes', () => {
  const r = registrations.createRegistrationRollup(registrationWindow)
  for (const row of [
    participant(1, {userId:100}), participant(2, {userId:100}),
    participant(3, {userId:100, programId:5156173, masterProgramId:5156167, programType:'CLUBTEAM'}),
    participant(4, {userId:100, programId:5184077, masterProgramId:5184029, programType:'EVENT'}),
    participant(5, {programId:4937434, masterProgramId:4937433, programType:'CLUBTEAM'}),
    participant(6, {programId:5123247, masterProgramId:5123246, programType:'CLUBTEAM'}),
    participant(7, {programId:5123249, masterProgramId:5123246, programType:'CLUBTEAM'}),
    participant(8, {programId:9000, masterProgramId:0, programType:'CLUBTEAM', programName:'Free tryout accept your team'}),
  ]) r.add(row)
  const s = r.finish(), props = registrations.registrationSnapshotProperties(s,'cron')
  assert.equal(s.current.reserved,8)
  assert.equal(s.groups.bookings.current.reserved,3)
  assert.equal(s.groups.bookings.current.athletes,2)
  assert.equal(s.groups.setup.current.reserved,2)
  assert.equal(s.groups.setup.current.athletes,1)
  assert.equal(s.groups.commitments.current.reserved,2)
  assert.equal(s.groups.unclassified.current.reserved,1)
  assert.match(registrations.registrationAnswer(s).action,/Classify/)
  assert.equal(props.current_bookings_athletes,2)
  assert.equal(props.current_setup_athletes,1)
  assert.doesNotMatch(JSON.stringify(props),/userId|9000|Free tryout/)
  s.groups.bookings.current.reserved++
  assert.equal(registrations.registrationAnswer(s).state,'unavailable','a non-reconciling group cannot pass')
})

test('missing athlete identities stay unavailable while booking counts survive and newer duplicate records replace old membership', () => {
  const r = registrations.createRegistrationRollup(registrationWindow)
  r.add(participant(1, {userId:undefined}))
  let s = r.finish()
  assert.equal(s.groups.bookings.current.reserved,1)
  assert.equal(s.groups.bookings.current.athletes,null)
  assert.match(registrations.registrationAnswer(s).heading,/athlete count unavailable/)
  r.add(participant(1, {lastUpdated:10,userId:5}))
  r.add(participant(1, {lastUpdated:1,userId:undefined}))
  s=r.finish()
  assert.equal(s.groups.bookings.current.athletes,1)
  assert.equal(s.groups.bookings.current.missingIdentity,0)
  r.add(participant(1, {lastUpdated:20,deleted:true}))
  assert.equal(r.finish().groups.bookings.current.athletes,0)
  s.version='630-registrations-v1'
  assert.equal(registrations.registrationAnswer(s).state,'unavailable','old snapshots cannot imply a verified split')
})

test('calendar context separates elapsed sessions and future dates without inventing a cause', () => {
  const r = registrations.createRegistrationRollup(registrationWindow)
  r.add(participant(1, {created:Date.parse('2026-10-03T12:00:00Z'),programStartDate:Date.parse('2026-10-05T04:00:00Z'),programEndDate:Date.parse('2026-10-05T04:00:00Z')}))
  r.add(participant(2, {created:Date.parse('2026-10-03T12:00:00Z'),programStartDate:Date.parse('2026-10-16T04:00:00Z'),programEndDate:Date.parse('2026-10-16T04:00:00Z')}))
  r.add(participant(3, {programStartDate:Date.parse('2026-10-16T04:00:00Z'),programEndDate:Date.parse('2026-10-16T04:00:00Z')}))
  const s=r.finish(), [row]=registrations.registrationProgramRows(s)
  assert.equal(s.families.girls_ms.previous.endedBeforeCurrent,1)
  assert.equal(s.families.girls_ms.current.future,1,'midnight Eastern label must not become October 15')
  assert.match(row.context,/1 earlier booking was for sessions that ended/)
  assert.match(row.context,/For dates still ahead: 1 booking, previously 1/)
  assert.match(registrations.registrationAnswer(s).action,/Review Girls middle-school/)
  assert.doesNotMatch(registrations.registrationAnswer(s).action,/caused|imported|checkout failure/)
  assert.equal(registrations.REGISTRATION_QUESTIONS.length,12)
  assert.match(registrations.registrationProgramsQuery(),/Program bookings unavailable/)
})
test('display verification reconstructs answers from numeric aggregates', () => {
  const now = new Date('2026-10-16T17:00:00Z'), r = registrations.createRegistrationRollup(registrationWindow)
  r.add(participant(1)); r.add(participant(2,{userId:1}))
  const s=r.finish(now.toISOString()),p=registrations.registrationSnapshotProperties(s,'manual')
  const source={status:p.status,period_start:p.period_start,period_end:p.period_end,counts:p.registration_counts_json,observed_at:'2026-10-16T17:00:00Z'}
  const expected=registrations.registrationExpectedTables(source,now)
  assert.equal(expected.summary[1][1],registrations.registrationAnswer(s).heading)
  assert.deepEqual(expected.programs[0],Object.values(registrations.registrationProgramRows(s)[0]))
  const broken=JSON.parse(source.counts);broken.groups.bookings.current.reserved++
  assert.throws(()=>registrations.registrationExpectedTables({...source,counts:JSON.stringify(broken)},now),/numeric source is invalid/)
  assert.match(registrations.registrationExpectedTables(null,now).summary[1][1],/unavailable/)
  assert.match(registrations.registrationExpectedTables({...source,observed_at:'2026-10-14T00:00:00Z'},now).summary[1][1],/unavailable/)
})
