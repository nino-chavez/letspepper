#!/usr/bin/env node
/** Read-only Business Suite capture. The caller owns Meta's read-only manifest gate. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { toggleContentFilter } from './business-suite-content-filter.mjs'
import { dailySeries, nativePeriod, postSnapshot, sourceRange, validateReport, IG_ID } from './business-suite-report.mjs'
const args=process.argv.slice(2), option=k=>args[args.indexOf(k)+1]
if(!args.includes('--out')||!args.includes('--previous'))throw Error('usage: capture-business-suite.mjs --out <private evidence directory> --previous <validated prior report.json>')
const dir=resolve(option('--out')), previous=validateReport(JSON.parse(readFileSync(option('--previous'),'utf8')))
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'})
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const end=add(today,-1),start=add(end,-13),month=end.slice(0,7)+'-01'
mkdirSync(dir,{recursive:true})
const run=(name,...args)=>execFileSync(name,args,{encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']}).trim()
const evaluate=js=>JSON.parse(run('browse-eval',js))
const save=(name,x)=>writeFileSync(join(dir,name+'.json'),JSON.stringify(x,null,2)+'\n')
const pause=()=>new Promise(r=>setTimeout(r,400))
function url(kind,start,end){const tr=encodeURIComponent(JSON.stringify({end,start}));return 'https://business.facebook.com/latest/insights/'+kind+'?'+new URLSearchParams({business_id:'315859855990883',asset_id:'569987303404898',platform:'Instagram',time_range:tr,...kind==='people'?{audience_tab:'trends'}:{}})}
async function capture(kind,start,end,name){
 run('browse-nav',url(kind,start,end),'--wait')
 for(let i=0;i<12;i++){
  const x=evaluate('return {url:location.href,captured_at:new Date().toISOString(),text:document.body.innerText,tables:[...document.querySelectorAll("table")].map(t=>t.innerText)}')
  try{sourceRange(x,{audience:kind==='people'});if(kind==='results')dailySeries(x);save(name,x);return x}catch(err){if(i===11)throw err;await pause()}
 }
}
try{
 run('browse-start')
 const results=await capture('results',start,end,'results-recheck')
 const rows=dailySeries(results),followPages={}
 for(let day=start;day<=end;day=add(day,1)){
  const x=await capture('people',day,day,'audience-'+day),text=x.text.replaceAll('\u200b','')
  const get=k=>{const m=new RegExp('\\n'+k+'\\s*\\n([\\d,]+)\\n').exec(text);return m?Number(m[1].replaceAll(',','')):null}
  const follows=get('Follows'),unfollows=get('Unfollows'),chart=rows.find(r=>r.day===day&&r.metric==='follows')?.value??null
  if(follows!==chart)throw Error('Daily Results/Audience follows mismatch: '+day)
  if(unfollows!==null)rows.push({day,metric:'unfollows',value:unfollows,observed_at:x.captured_at,source_url:x.url})
  followPages[day]={...x,follows,unfollows}
 }
 save('daily-followers',followPages)
 const periods=previous.periods.filter(p=>p.end<month && p.start.slice(0,7)===p.end.slice(0,7))
 let currentFollowers=null,followersObservedAt=null
 for(const [from,name] of [[month,'month'],['2026-09-01','cumulative']]){
  const r=await capture('results',from,end,'results-'+name),a=await capture('people',from,end,'audience-'+name)
  periods.push(nativePeriod(r,a))
  const m=/Followers\s*\nLifetime\n([\d,]+)/.exec(a.text.replaceAll('\u200b',''))
  if(!m)throw Error('Current follower count missing')
  currentFollowers=Number(m[1].replaceAll(',',''));followersObservedAt=a.captured_at
 }
 run('browse-nav',url('content','2026-09-01',end),'--wait')
 evaluate(`(${toggleContentFilter.toString()})()`);await pause()
 evaluate('const o=[...document.querySelectorAll("[role=option]")].find(e=>e.innerText==="Instagram Feed");if(!o)throw Error("Instagram Feed filter missing");if(o.getAttribute("aria-selected")!=="true")o.click();return true');await pause()
 // Persist evidence of the selected placement, then close its menu.
 let selected=evaluate('return [...document.querySelectorAll("[role=option]")].map(e=>({text:e.innerText,selected:e.getAttribute("aria-selected")}))')
 if(!selected.length){evaluate(`(${toggleContentFilter.toString()})()`);await pause();selected=evaluate('return [...document.querySelectorAll("[role=option]")].map(e=>({text:e.innerText,selected:e.getAttribute("aria-selected")}))')}
 if(!selected.some(o=>o.text==='Instagram Feed'&&o.selected==='true'))throw Error('Instagram Feed selection not verified')
 save('content-filter',selected);evaluate(`(${toggleContentFilter.toString()})()`)
 evaluate('const v=[...document.querySelectorAll("[role=button]")].find(e=>e.innerText.replaceAll("\u200b","").trim()==="Views");if(!v)throw Error("Views heading missing");v.click();return true');await pause()
 let content
 for(let i=0;i<12;i++){
  content=evaluate('return {url:location.href,captured_at:new Date().toISOString(),text:document.body.innerText,sort:document.querySelector("[aria-sort]")?.getAttribute("aria-sort"),rows:[...document.querySelectorAll("tr[data-index]")].map(e=>({index:e.getAttribute("data-index"),cells:[...e.querySelectorAll("td")].map(c=>c.innerText),links:[...e.querySelectorAll("a[href]")].map(a=>a.href)}))}')
  content.filter='Instagram Feed'
  try{postSnapshot(content,previous.snapshot.posts);break}catch(err){if(i===11)throw err;evaluate('document.querySelector("table").scrollTop+=350;return true');await pause()}
 }
 save('content-top',content)
 const merged=new Map(previous.daily.map(r=>[r.day+'/'+r.metric,r]));for(const row of rows)merged.set(row.day+'/'+row.metric,row)
 const report=validateReport({version:1,account:'630',instagram_id:IG_ID,captured_at:new Date().toISOString(),through_day:end,current_followers:currentFollowers,followers_observed_at:followersObservedAt,daily:[...merged.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.metric.localeCompare(b.metric)),periods,snapshot:postSnapshot(content,previous.snapshot.posts),weekly_backfill:previous.weekly_backfill,individual_tracking:'waiting_for_owner_exports'})
 save('report',report);console.log('Validated Business Suite report through '+end+'; '+new Set(report.daily.map(r=>r.day)).size+' source days')
}finally{run('browse-tabs','close-owned')}
