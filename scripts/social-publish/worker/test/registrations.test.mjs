import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import worker from '../src/index.js'
import { runRegistrations, leagueAppsAccessToken, REGISTRATIONS_CRON, REGISTRATIONS_STATUS_KEY } from '../src/registrations.js'

// Invented records and an ephemeral test key. No provider data or key is saved.
const pair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----` // pragma: allowlist secret - ephemeral generated test key
const now = new Date('2026-10-16T17:00:00Z')
const row = (id,extra={}) => ({id,registrationId:id,userId:id,programId:5121761,masterProgramId:5121753,programType:'CLASS',lastUpdated:id,created:Date.parse('2026-10-10T06:00:00Z'),role:'FREEAGENT',isStaff:0,deleted:false,registrationStatus:'SPOT_RESERVED',paymentStatus:'PAID',email:'never-publish@example.invalid',...extra})
function env() {
  const records=new Map()
  return {LEAGUEAPPS_PRIVATE_KEY:pem,LEAGUEAPPS_CLIENT_ID:'test-client',POSTHOG_630_PROJECT_TOKEN:'test-project-token',TRIGGER_KEY:'test-trigger',QUEUE:{async put(k,v){records.set(k,v)},async get(k){return records.has(k)?JSON.parse(records.get(k)):null}},records}
}
function harness(pages, { exportStatus=200, captureStatus=200, programs=[] }={}) {
  const calls=[], captures=[]
  return {calls,captures,fetch:async(url,opts)=>{
    calls.push(String(url))
    if(String(url).includes('/auth/token')){
      const assertion=opts.body.get('assertion'),parts=assertion.split('.')
      assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://auth.leagueapps.io/v2/auth/token')
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts.slice(0,2).join('.'))),true)
      return Response.json({access_token:'test-access'})
    }
    if(String(url).includes('public.leagueapps.io')) return Response.json(programs)
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
  assert.equal(captured.properties.current_bookings_reserved,1)
  assert.equal(captured.properties.current_bookings_athletes,1)
  assert.equal(result.groups.bookings.current.athletes,1)
  assert.equal(result.version,'630-registrations-v2')
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
  delete e.POSTHOG_630_PROJECT_TOKEN
  const r=await runRegistrations(e,{now,fetch:()=>{throw Error('must not fetch')}})
  assert.equal(r.status,'unavailable');assert.match(r.reason,/credentials/)
})
test('missing LeagueApps credentials publish unavailable when capture is available',async()=>{
  const e=env(),h=harness([])
  delete e.LEAGUEAPPS_PRIVATE_KEY
  const r=await runRegistrations(e,{now,fetch:h.fetch})
  assert.equal(r.status,'unavailable');assert.equal(r.delivery,'accepted')
  assert.equal(h.calls.length,1);assert.equal(h.captures[0].properties.status,'unavailable')
  assert.equal(h.captures[0].properties.current_reserved,null)
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
  const e=env();delete e.POSTHOG_630_PROJECT_TOKEN
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
  delete e.POSTHOG_630_PROJECT_TOKEN
  const response=await worker.fetch(new Request('https://example.invalid/registrations/run',{method:'POST',headers}),e)
  assert.equal(response.headers.get('Cache-Control'),'no-store')
  assert.equal((await response.json()).status,'unavailable')
})

test('outbound requests work in the actual Workers runtime and reject redirects',async()=>{
  const require = createRequire(import.meta.url)
  const { Miniflare } = createRequire(require.resolve('wrangler'))('miniflare')
  const source = readFileSync(new URL('../src/registrations.js', import.meta.url), 'utf8')
  const contract = readFileSync(new URL('../../analytics-contract.mjs', import.meta.url), 'utf8')
  const mf = new Miniflare({ compatibilityDate:'2026-01-01', modulesRoot:'/', modules:[
    {type:'ESModule',path:'/entry.js',contents:`
      import {runRegistrations} from './worker/src/registrations.js';
      export default {async fetch(request,env){
        const calls=[];
        const redirect=new URL(request.url).pathname==='/redirect';
        const result=await runRegistrations({...env,QUEUE:{async put(){}}},{fetch:async(url,options)=>{
          const outbound=new Request(url,options);
          calls.push({url:String(url),redirect:outbound.redirect});
          if(String(url).includes('/auth/token')) return redirect ? new Response(null,{status:302,headers:{Location:'https://untrusted.invalid'}}) : Response.json({access_token:'test-token'});
          if(String(url).includes('public.leagueapps.io')) return Response.json(programs)
    if(String(url).includes('/export/')) return Response.json([]);
          return Response.json({status:1});
        }});
        return Response.json({result,calls});
      }};
    `},
    {type:'ESModule',path:'/worker/src/registrations.js',contents:source},
    {type:'ESModule',path:'/analytics-contract.mjs',contents:contract},
  ],bindings:{LEAGUEAPPS_PRIVATE_KEY:pem,LEAGUEAPPS_CLIENT_ID:'test-client',POSTHOG_630_PROJECT_TOKEN:'test-project-token'}})
  try {
    const complete=await (await mf.dispatchFetch('https://test.invalid/')).json()
    assert.equal(complete.result.status,'verified')
    assert.equal(complete.result.delivery,'accepted')
    assert.equal(complete.calls.length,3)
    assert.ok(complete.calls.every(call=>call.redirect==='manual'))
    const rejected=await (await mf.dispatchFetch('https://test.invalid/redirect')).json()
    assert.equal(rejected.result.status,'unavailable')
    assert.equal(rejected.result.delivery,'accepted')
    assert.equal(rejected.calls.length,2)
  } finally { await mf.dispose() }
})


test('session metadata joins the complete export and a metadata failure preserves only private totals',async()=>{
  const e=env(); e.LEAGUEAPPS_PUBLIC_API_KEY='test-public';
  const programs=[{programId:5121761,masterProgramId:5121283,startTime:Date.parse('2026-10-19T04:00:00Z'),endTime:Date.parse('2026-10-19T04:00:00Z'),scheduleTimes:'5:00PM to 7:00PM'}]
  const h=harness([[row(1,{masterProgramId:5121283})],[]],{programs})
  await runRegistrations(e,{now,fetch:h.fetch})
  const p=h.captures[0].properties
  assert.equal(JSON.parse(p.registration_counts_json).sessionOperations.sessions[0].booked,1)
  assert.match(p.session_breakdown_json,/Mon, Oct 19/)
  const bad=harness([[row(1)],[]],{programs:{error:'private'}})
  await runRegistrations(e,{now,fetch:bad.fetch})
  assert.equal(bad.captures[0].properties.status,'verified')
  assert.match(bad.captures[0].properties.session_breakdown_json,/unavailable/)
})

test('session metadata includes completed programs so past clinics remain comparable', async()=>{
 const e=env();e.LEAGUEAPPS_PUBLIC_API_KEY='public-test';const h=harness([[]]);
 await runRegistrations(e,{now,fetch:h.fetch});
 assert.ok(h.calls.some(url=>url.includes('includeState=LIVE,UPCOMING,COMPLETED&includePrivate=true')));
})
