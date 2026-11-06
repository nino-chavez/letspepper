import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IG_ID } from '../business-suite-report.mjs'
import { finishCapture } from '../business-suite-capture-cleanup.mjs'

// Every value here is invented. Real reports stay in private storage.
const script=fileURLToPath(new URL('../capture-business-suite.mjs',import.meta.url))
const refresh=fileURLToPath(new URL('../refresh-business-suite.mjs',import.meta.url))
const at='2026-10-03T14:00:00.000Z'
const previous={version:1,account:'630',instagram_id:IG_ID,captured_at:at,through_day:'2026-10-02',daily:[],periods:[],weekly_backfill:[],snapshot:{start:'2026-10-01',end:'2026-10-02',observed_at:at,posts:Array.from({length:12},(_,i)=>({identity_key:'invented-'+i,published_day:'2026-10-01',observed_at:at}))}}

function stubBrowser(dir,commands){
 for(const [name,body] of Object.entries(commands)){const file=join(dir,name);writeFileSync(file,'#!/bin/sh\n'+body+'\n');chmodSync(file,0o755)}
}

// Reproduces November 3-4, 2026: the capture failed, then close-owned stalled and its error was all that survived.
function failingBrowserRun(entry,check,{args=[],before=()=>{}}={}){
 const dir=mkdtempSync(join(tmpdir(),'bs-capture-'))
 try{
  const bin=join(dir,'bin'),out=join(dir,'out'),prev=join(dir,'previous.json')
  mkdirSync(bin);mkdirSync(out);writeFileSync(prev,JSON.stringify(previous));before(out)
  stubBrowser(bin,{
   'browse-start':'echo "invented start failure marker" >&2; exit 1',
   'browse-tabs':'echo "browse-tabs: timed out after 90s during command." >&2; exit 124'
  })
  const {CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN,...env}=process.env
  const r=spawnSync(process.execPath,[entry,'--out',out,'--previous',prev,...args],{encoding:'utf8',timeout:30000,env:{...env,PATH:bin+delimiter+env.PATH}})
  check(r,out)
 }finally{rmSync(dir,{recursive:true,force:true})}
}

test('a failed browser cleanup cannot replace the capture error',()=>failingBrowserRun(script,(r,out)=>{
  assert.notEqual(r.status,0)
  assert.match(r.stderr,/invented start failure marker/)
  const failure=JSON.parse(readFileSync(join(out,'capture-failed.json'),'utf8'))
  assert.match(failure.message,/invented start failure marker/)
  assert.match(failure.cleanup_error,/timed out after 90s/)
}))

test('the refresh failure receipt carries the capture cause, not only the child exit',()=>failingBrowserRun(refresh,(r,out)=>{
  assert.notEqual(r.status,0)
  const receipt=JSON.parse(readFileSync(join(out,'db-sync-failed.json'),'utf8'))
  assert.match(receipt.capture_error,/invented start failure marker/)
  assert.match(receipt.capture_cleanup_error,/timed out after 90s/)
  assert.equal(receipt.sheet_written,false)
}))

test('a failure file left by an earlier run is not reported as this run\'s cause',()=>failingBrowserRun(refresh,(r,out)=>{
  assert.notEqual(r.status,0)
  const receipt=JSON.parse(readFileSync(join(out,'db-sync-failed.json'),'utf8'))
  assert.equal(receipt.capture_error,null)
  assert.match(receipt.message,/report\.json/)
},{args:['--import-only'],before:out=>writeFileSync(join(out,'capture-failed.json'),JSON.stringify({failed_at:'2026-01-01T00:00:00.000Z',message:'stale invented failure',cleanup_error:null}))}))

test('a failed cleanup after a validated capture is recorded, not fatal',async()=>{
 const records=[]
 const result=await finishCapture({work:async()=>'report',cleanup:()=>{throw Error('cleanup stalled')},record:(name,x)=>records.push([name,x])})
 assert.equal(result,'report')
 assert.equal(records.length,1)
 assert.equal(records[0][0],'capture-cleanup-failed')
 assert.match(records[0][1].message,/cleanup stalled/)
})

test('a capture failure is recorded once and rethrown unchanged',async()=>{
 const records=[],original=Error('invented capture failure')
 await assert.rejects(finishCapture({work:async()=>{throw original},cleanup:()=>{},record:(name,x)=>records.push([name,x])}),e=>e===original)
 assert.deepEqual(records.map(([name])=>name),['capture-failed'])
 assert.equal(records[0][1].cleanup_error,null)
})
