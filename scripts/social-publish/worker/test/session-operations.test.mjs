import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionOperations, safeSessionOperations, sessionRows, pendingPaymentAction, createRegistrationRollup, registrationSnapshotProperties, registrationExpectedTables, reportingWindow } from '../../analytics-contract.mjs'
// Synthetic registrations only. These IDs, people and balances are invented.
const ts=day=>Date.parse(day+'T04:00:00Z')
const program=(id,date,extra={})=>({programId:id,masterProgramId:5121283,isMaster:false,deleted:false,startTime:ts(date),endTime:ts(date),scheduleTimes:'5:00PM to 7:00PM',...extra})
const programs=[program(1,'2026-09-28'),program(2,'2026-10-05'),program(3,'2026-10-12'),program(4,'2026-10-19'),program(5,'2026-10-16')]
const now='2026-10-17T01:00:00Z'
const row=(id,programId,extra={})=>({registrationId:id,id,lastUpdated:id,userId:id,programId,masterProgramId:5121283,programType:'CLASS',created:Date.parse('2026-09-01T17:00:00Z'),programStartDate:ts('2026-09-14'),programEndDate:ts('2026-11-13'),role:'FREEAGENT',isStaff:0,deleted:false,registrationStatus:'SPOT_RESERVED',paymentStatus:'PAID',outstandingBalance:0,email:'PRIVATE@example.invalid',...extra})
function build(rows,opts={}){const x=createSessionOperations({programs,...opts});for(const r of rows)x.add(r);return x.finish(now)}
test('deduplicates passes, tickets, revisions and athlete identity; excludes staff and invalid spots',()=>{
 const result=build([row(1,5121284,{userId:10}),row(2,4,{userId:10}),row(3,4),row(4,4,{isStaff:1}),row(5,4,{paymentStatus:'REFUND'}),row(6,4,{deleted:true}),row(7,4),row(7,4,{lastUpdated:99,registrationStatus:'SPOT_PENDING',outstandingBalance:35})])
 assert.equal(result.sessions.length,1,'today’s ended clinic is not upcoming')
 assert.equal(result.sessions[0].booked,2);assert.equal(result.sessions[0].pending,1)
 assert.equal(result.sessions[0].date,'2026-10-19','calendar labels do not roll back into the prior Central date')
 assert.equal(result.sessions[0].capacity,null)
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|userId|registrationId|email/)
})
test('matches weekday, time, lead days and Central clock; includes zero-booking sessions',()=>{
 const result=build([row(1,1,{created:Date.parse('2026-09-26T00:59:59Z')}),row(2,1,{created:Date.parse('2026-09-26T01:00:01Z')}),row(3,2,{created:Date.parse('2026-10-02T20:00:00Z')}),row(4,4)])
 assert.deepEqual([result.sessions[0].leadDays,result.sessions[0].baselineCount,result.sessions[0].baselineMin,result.sessions[0].baselineMax],[3,3,0,1])
 assert.match(sessionRows(result)[0].pace,/0–1 at 3 days out/)
 assert.match(sessionRows(result)[0].action,/At or above/)
})
test('known capacity unions pending and reserved, warns on overflow, and expires honestly',()=>{
 const rows=[row(1,5121284,{userId:10}),row(2,4,{userId:10,registrationStatus:'SPOT_PENDING'}),row(3,4)]
 const cap={limit:1,countPending:true,checkedOn:'2026-10-01',validThrough:'2026-11-13'}
 const result=build(rows,{capacities:{4:cap}})
 assert.equal(result.sessions[0].occupied,2);assert.equal(result.sessions[0].remaining,0);assert.equal(result.sessions[0].overCapacity,1)
 assert.match(sessionRows(result)[0].action,/Resolve capacity/)
 assert.equal(build(rows,{capacities:{4:{...cap,validThrough:'2026-10-18'}}}).sessions[0].capacity,null)
 assert.equal(build(rows,{capacities:{4:{...cap,checkedOn:'2026-10-20'}}}).sessions[0].capacity,null)
})
test('missing athlete IDs and missing metadata never become zero',()=>{
 const result=build([row(1,4,{userId:null})])
 assert.equal(result.sessions[0].booked,null);assert.match(sessionRows(result)[0].booked,/Unavailable/)
 assert.match(sessionRows(build([],{programs:null}))[0].pace,/unavailable/)
 assert.match(sessionRows(build([],{programs:[program(4,'2026-10-19',{scheduleTimes:null})]}))[0].pace,/unavailable/)
})
test('pending actions include old outstanding packages and validated tryout dates without family text',()=>{
 const result=build([row(1,5121284,{registrationStatus:'SPOT_PENDING',outstandingBalance:542,created:Date.parse('2026-09-22T17:00:00Z')}),row(2,4937481,{masterProgramId:4937480,programType:'CLUBTEAM',registrationStatus:'SPOT_PENDING',outstandingBalance:40,'Please choose a make-up tryout date':'11/8 / 6:30 - 8pm'})])
 const action=pendingPaymentAction(result)
 assert.match(action,/Nov 8, 2026, 6:30PM to 8:00PM/);assert.match(action,/\$40/);assert.match(action,/\$542/);assert.match(action,/all-session pass/)
 assert.doesNotMatch(action,/PRIVATE/)
 const unparsed=build([row(3,4937481,{masterProgramId:4937480,registrationStatus:'SPOT_PENDING','Please choose a make-up tryout date':'PRIVATE family instructions'})])
 assert.match(pendingPaymentAction(unparsed),/date needs confirmation/);assert.doesNotMatch(JSON.stringify(unparsed),/PRIVATE/)
})
test('explicit allowlist and integrity guards reject corrupted counts but drop enriched identity fields',()=>{
 const result=build([row(1,4)])
 result.email='PRIVATE';result.sessions[0].email='PRIVATE';result.payments.push({program:4,family:'girls_hs',date:null,time:null,count:1,unpaid:1,balance:40,missingBalance:0,oldest:'2026-10-01',pass:false,email:'PRIVATE'})
 assert.doesNotMatch(JSON.stringify(safeSessionOperations(result)),/PRIVATE|email/)
 result.sessions[0].remaining=10
 assert.equal(safeSessionOperations(result),null)
})
test('published numeric source independently regenerates the displayed session and payment answers',()=>{
 const rollup=createRegistrationRollup(reportingWindow({now}));const r=row(1,4,{created:Date.parse('2026-10-10T17:00:00Z')});rollup.add(r)
 const snapshot=rollup.finish(now);snapshot.sessionOperations=build([r]);snapshot.sessionOperations.secret='PRIVATE'
 const p=registrationSnapshotProperties(snapshot,'cron')
 assert.doesNotMatch(JSON.stringify(p),/PRIVATE|email|userId/)
 const expected=registrationExpectedTables({status:p.status,period_start:p.period_start,period_end:p.period_end,observed_at:now,counts:p.registration_counts_json},now)
 assert.deepEqual(expected.sessions,JSON.parse(p.session_breakdown_json).map(r=>[r.session,r.booked,r.pace,r.capacity,r.action]))
 assert.equal(expected.summary.find(r=>r[0]==='Pending-payment follow-up')[1],p.pending_payments)
 assert.match(expected.summary.find(r=>r[0]==='Bookings or attendance?')[1],/not yet verified/)
})
