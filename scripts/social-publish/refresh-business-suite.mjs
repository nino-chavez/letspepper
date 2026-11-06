#!/usr/bin/env node
/** Capture, import, and read back the report. Keep all outputs in a private directory. */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, delimiter } from 'node:path'
import { validateReport, verifyDailyReadback } from './business-suite-report.mjs'
import { reportStatements, d1Query } from './business-suite-import.mjs'
process.env.PATH=dirname(process.execPath)+delimiter+process.env.PATH
const args=process.argv.slice(2),opt=k=>args[args.indexOf(k)+1]
if(!args.includes('--out')||!args.includes('--previous'))throw Error('usage: refresh-business-suite.mjs --out <private directory> --previous <report.json> [--import-only]')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(opt('--out')),previous=resolve(opt('--previous'))
// A capture can spend 120s on a stalled browser command plus 45s on cleanup; stay well above that.
const run=(name,a,options={})=>execFileSync(name,a,{cwd:root,encoding:'utf8',timeout:600000,stdio:['ignore','pipe','pipe'],...options})
const config='scripts/social-publish/worker/wrangler.jsonc',reportFile=join(out,'report.json')
const started=new Date().toISOString()
// Only a failure file written during this run counts; a retry may reuse the evidence directory.
const thisRun=name=>{const file=join(out,name+'.json');if(!existsSync(file))return null;const x=JSON.parse(readFileSync(file,'utf8'));return x.failed_at>=started?x:null}
const binding=readFileSync(join(root,config),'utf8').match(/\{[^{}]*"binding"\s*:\s*"INSIGHTS_DB"[^{}]*\}/)?.[0]
if(!binding)throw Error('Missing INSIGHTS_DB configuration')
const query=(sql,params=[])=>d1Query({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:JSON.parse(binding).database_id,token:process.env.CLOUDFLARE_API_TOKEN,sql,params})
try{
 if(!args.includes('--import-only'))run(process.execPath,['scripts/social-publish/capture-business-suite.mjs','--out',out,'--previous',previous],{stdio:['ignore','inherit','inherit']})
 const report=validateReport(JSON.parse(readFileSync(reportFile,'utf8')))
 for(const statement of reportStatements(report))await query(statement.sql,statement.params)
 const result=await query('SELECT report_json FROM business_suite_reports WHERE account=?1 AND captured_at=?2',['630',report.captured_at])
 const stored=JSON.parse(result[0]?.report_json??'null')
 if(JSON.stringify(stored)!==JSON.stringify(report))throw Error('Database report readback mismatch')
 const rows=await query("SELECT day,metric,value,last_observed_at FROM account_metric_days WHERE account=?1 AND source='business_suite' AND day BETWEEN ?2 AND ?3",['630','2026-09-01',report.through_day])
 verifyDailyReadback(report.daily,rows)
 await query("INSERT INTO business_suite_sync_runs (account,started_at,finished_at,state,detail) VALUES (?1,?2,?3,'ok',NULL)",['630',started,new Date().toISOString()])
 const receipt={status:'success',completed_at:new Date().toISOString(),through_day:report.through_day,report_captured_at:report.captured_at,report_readback:true,daily_values_verified:report.daily.length,source_days:new Set(report.daily.map(r=>r.day)).size,snapshot_posts:report.snapshot.posts.length,browser_cleanup:thisRun('capture-cleanup-failed')?'failed':'ok',sheet_written:false}
 writeFileSync(join(out,'db-sync-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt))
}catch(error){
 try{await query("INSERT INTO business_suite_sync_runs (account,started_at,finished_at,state,detail) VALUES (?1,?2,?3,'error',?4) ON CONFLICT (account,started_at) DO NOTHING",['630',started,new Date().toISOString(),'Business Suite capture or import failed. Check the private refresh receipt; the last good report is retained.'])}catch{}
 // The capture child's own receipt names the real cause; the exec error only says the child exited.
 const cause=thisRun('capture-failed')
 writeFileSync(join(out,'db-sync-failed.json'),JSON.stringify({status:'failed',attempted_at:new Date().toISOString(),message:error.message,capture_error:cause?.message??null,capture_cleanup_error:cause?.cleanup_error??null,previous_report:previous,sheet_written:false},null,2)+'\n');throw error}
