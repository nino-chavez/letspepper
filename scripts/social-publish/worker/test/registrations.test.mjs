import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import worker from '../src/index.js'
import { runRegistrations, leagueAppsAccessToken, REGISTRATIONS_CRON, REGISTRATIONS_STATUS_KEY } from '../src/registrations.js'

// Invented records and an ephemeral test key. No provider data or key is saved.
const pair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----` // pragma: allowlist secret - ephemeral generated test key
const now = new Date('2026-10-16T17:00:00Z')
const row = (id,extra={}) => ({id,registrationId:id,lastUpdated:id,created:Date.parse('2026-10-10T06:00:00Z'),role:'FREEAGENT',isStaff:0,deleted:false,registrationStatus:'SPOT_RESERVED',paymentStatus:'PAID',email:'never-publish@example.invalid',...extra})
function env() {
  const records=new Map()
  return {LEAGUEAPPS_PRIVATE_KEY:pem,LEAGUEAPPS_CLIENT_ID:'test-client',POSTHOG_630_PROJECT_TOKEN:'test-project-token',TRIGGER_KEY:'test-trigger',QUEUE:{async put(k,v){records.set(k,v)},async get(k){return records.has(k)?JSON.parse(records.get(k)):null}},records}
}
function harness(pages, { exportStatus=200, captureStatus=200 }={}) {
  const calls=[], captures=[]
  return {calls,captures,fetch:async(url,opts)=>{
    calls.push(String(url))
    if(String(url).includes('/auth/token')){
      const assertion=opts.body.get('assertion'),parts=assertion.split('.')
      assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://auth.leagueapps.io/v2/auth/token')
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts.slice(0,2).join('.'))),true)
      return Response.json({access_token:'test-access'})
    }
    if(String(url).includes('/export/'))return Response.json(exportStatus===200?pages.shift():{private:'never-publish@example.invalid'},{status:exportStatus})
    captures.push(JSON.parse(opts.body))
    return Response.json({status:captureStatus===200?1:0},{status:captureStatus})
  }}
}
test('signed auth, complete multi-page read and aggregate-only capture',async()=>{
  const e=env(), h=harness([[row(1)],[row(1),row(2,{registrationStatus:'SPOT_PENDING'})],[]])
  const result=await runRegistrations(e,{now,trigger:'cron',fetch:h.fetch})
  assert.equal(result.status,'verified');assert.equal(result.delivery,'accepted')
  assert.equal(result.rowsRead,2);assert.equal(result.pages,3)
  assert.equal(result.current.reserved,1);assert.equal(result.current.pending,1)
  assert.match(h.calls[2],/last-updated=1&last-id=1/)
  const captured=h.captures[0]
  assert.equal(captured.properties.$process_person_profile,false)
  assert.equal(captured.properties.trigger,'cron')
  assert.equal(captured.properties.current_reserved,1)
  assert.notEqual(captured.distinct_id,'test-client')
  assert.doesNotMatch(JSON.stringify(captured),/never-publish|registrationId|test-access/)
  assert.doesNotMatch(JSON.stringify(await e.QUEUE.get(REGISTRATIONS_STATUS_KEY)),/never-publish|registrationId|test-access/)
})
test('upstream failure publishes unavailable with no invented zero and no provider body',async()=>{
  const e=env(),h=harness([],{exportStatus:500})
  const r=await runRegistrations(e,{now,fetch:h.fetch})
  assert.equal(r.status,'unavailable');assert.equal(r.delivery,'accepted')
  assert.equal(h.captures[0].properties.current_reserved,null)
  assert.match(h.captures[0].properties.answer,/unavailable/)
  assert.doesNotMatch(JSON.stringify(r),/never-publish/)
})
test('incomplete export never publishes partial counts',async()=>{
  const e=env(),h=harness([[row(1)],[row(2,{lastUpdated:0})]])
  const r=await runRegistrations(e,{now,fetch:h.fetch})
  assert.equal(r.status,'unavailable');assert.equal(h.captures[0].properties.current_reserved,null)
})
test('capture rejection and missing credentials are visible failures',async()=>{
  const e=env(),h=harness([[]],{captureStatus:400})
  assert.equal((await runRegistrations(e,{now,fetch:h.fetch})).delivery,'failed')
  delete e.LEAGUEAPPS_PRIVATE_KEY
  const r=await runRegistrations(e,{now,fetch:()=>{throw Error('must not fetch')}})
  assert.equal(r.status,'unavailable');assert.match(r.reason,/credentials/)
})
test('401 renews once, repeated rejection stays unavailable',async()=>{
  const e=env(),h=harness([],{exportStatus:401})
  const r=await runRegistrations(e,{now,fetch:h.fetch})
  assert.equal(r.status,'unavailable')
  assert.equal(h.calls.filter(x=>x.includes('/auth/token')).length,2)
  assert.equal(h.calls.filter(x=>x.includes('/export/')).length,2)
})
test('registration cron is isolated from publishing and matches deployed schedule',async()=>{
  const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')
  const crons=JSON.parse(config.match(/"crons":\s*(\[[^\]]*\])/)[1])
  assert.ok(crons.includes(REGISTRATIONS_CRON))
  const e=env();delete e.LEAGUEAPPS_PRIVATE_KEY
  const jobs=[]
  await worker.scheduled({cron:REGISTRATIONS_CRON},e,{waitUntil(p){jobs.push(p)}})
  await Promise.all(jobs)
  assert.equal(e.records.size,1)
  assert.equal(JSON.parse(e.records.get(REGISTRATIONS_STATUS_KEY)).trigger,'cron')
})
test('manual refresh is POST-only and header-authenticated; wrong key is rejected',async()=>{
  const e=env()
  for(const key of ['', 'wrong']) {
    const r=await worker.fetch(new Request('https://example.invalid/registrations/run',{method:'POST',headers:{Authorization:`Bearer ${key}`}}),e)
    assert.equal(r.status,403)
  }
  assert.equal((await worker.fetch(new Request('https://example.invalid/registrations/run?key=test-trigger',{method:'POST'}),e)).status,403)
  const headers={Authorization:'Bearer test-trigger'}
  assert.equal((await worker.fetch(new Request('https://example.invalid/registrations/run',{headers}),e)).status,405)
  delete e.LEAGUEAPPS_PRIVATE_KEY
  const response=await worker.fetch(new Request('https://example.invalid/registrations/run',{method:'POST',headers}),e)
  assert.equal(response.headers.get('Cache-Control'),'no-store')
  assert.equal((await response.json()).status,'unavailable')
})
