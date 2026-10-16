#!/usr/bin/env node
/** Capture, import, and read back the report. Keep all outputs in a private directory. */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, delimiter } from 'node:path'
import { reportSql, validateReport } from './business-suite-report.mjs'
process.env.PATH=dirname(process.execPath)+delimiter+process.env.PATH
const args=process.argv.slice(2),opt=k=>args[args.indexOf(k)+1]
if(!args.includes('--out')||!args.includes('--previous'))throw Error('usage: refresh-business-suite.mjs --out <private directory> --previous <report.json> [--import-only]')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(opt('--out')),previous=resolve(opt('--previous'))
const run=(name,a,options={})=>execFileSync(name,a,{cwd:root,encoding:'utf8',timeout:300000,stdio:['ignore','pipe','pipe'],...options})
const config='scripts/social-publish/worker/wrangler.jsonc',reportFile=join(out,'report.json')
const started=new Date().toISOString()
const sqlString=s=>`'${String(s).replaceAll("'","''")}'`
try{
 if(!args.includes('--import-only'))run(process.execPath,['scripts/social-publish/capture-business-suite.mjs','--out',out,'--previous',previous],{stdio:['ignore','inherit','inherit']})
 const report=validateReport(JSON.parse(readFileSync(reportFile,'utf8'))),sqlFile=join(out,'import-report.sql')
 writeFileSync(sqlFile,reportSql(report))
 run('pnpm',['exec','wrangler','d1','execute','INSIGHTS_DB','--remote','--config',config,'--file',sqlFile,'--yes','--json'])
 const query=`SELECT report_json FROM business_suite_reports WHERE account='630' AND captured_at=${sqlString(report.captured_at)}`
 const result=JSON.parse(run('pnpm',['exec','wrangler','d1','execute','INSIGHTS_DB','--remote','--config',config,'--command',query,'--json']))
 const stored=JSON.parse(result[0]?.results?.[0]?.report_json??'null')
 if(JSON.stringify(stored)!==JSON.stringify(report))throw Error('Database report readback mismatch')
 // Read every affected daily row. A fresh observation must match; a newer DB revision
 // may legitimately win. A missing source value was never written.
 const rows=JSON.parse(run('pnpm',['exec','wrangler','d1','execute','INSIGHTS_DB','--remote','--config',config,'--command',`SELECT day,metric,value,last_observed_at FROM account_metric_days WHERE account='630' AND source='business_suite' AND day BETWEEN '2026-09-01' AND ${sqlString(report.through_day)}`,'--json']))[0].results
 const byKey=new Map(rows.map(r=>[r.day+'/'+r.metric,r]))
 for(const row of report.daily){const saved=byKey.get(row.day+'/'+row.metric);if(!saved||!Number.isFinite(Date.parse(saved.last_observed_at))||Date.parse(saved.last_observed_at)<Date.parse(row.observed_at)||(Date.parse(saved.last_observed_at)===Date.parse(row.observed_at)&&saved.value!==row.value))throw Error('Daily readback mismatch: '+row.day+'/'+row.metric)}
 if(byKey.size!==rows.length)throw Error('Duplicate database daily key')
 run('pnpm',['exec','wrangler','d1','execute','INSIGHTS_DB','--remote','--config',config,'--command',`INSERT INTO business_suite_sync_runs (account,started_at,finished_at,state,detail) VALUES ('630',${sqlString(started)},${sqlString(new Date().toISOString())},'ok',NULL)`,'--yes','--json'])
 const receipt={status:'success',completed_at:new Date().toISOString(),through_day:report.through_day,report_captured_at:report.captured_at,report_readback:true,daily_values_verified:report.daily.length,source_days:new Set(report.daily.map(r=>r.day)).size,snapshot_posts:report.snapshot.posts.length,sheet_written:false}
 writeFileSync(join(out,'db-sync-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt))
}catch(error){
 try{run('pnpm',['exec','wrangler','d1','execute','INSIGHTS_DB','--remote','--config',config,'--command',`INSERT INTO business_suite_sync_runs (account,started_at,finished_at,state,detail) VALUES ('630',${sqlString(started)},${sqlString(new Date().toISOString())},'error','Business Suite capture or import failed. Check the private refresh receipt; the last good report is retained.') ON CONFLICT (account,started_at) DO NOTHING`,'--yes','--json'])}catch{}
 writeFileSync(join(out,'db-sync-failed.json'),JSON.stringify({status:'failed',attempted_at:new Date().toISOString(),message:error.message,previous_report:previous,sheet_written:false},null,2)+'\n');throw error}
