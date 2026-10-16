/** Normalize observed Business Suite captures; no network, credentials or Sheet access. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { importSql } from './import-business-suite-insights.mjs'

export const ACCOUNT = '630'
export const IG_ID = '17841411569230130'
const ASSET = '569987303404898', BUSINESS = '315859855990883'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const validDay=d=>DAY.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const clean = s => String(s).replaceAll('\u200b', '')
const count = s => /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(String(s)) ? Number(String(s).replaceAll(',', '')) : null
const dateLabel = day => new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})
export function sourceRange(capture, { audience = false } = {}) {
  const u = new URL(capture.url)
  if (u.origin !== 'https://business.facebook.com' || u.searchParams.get('asset_id') !== ASSET || u.searchParams.get('business_id') !== BUSINESS || u.searchParams.get('platform') !== 'Instagram') throw Error('Wrong Business Suite account or platform')
  let range = JSON.parse(decodeURIComponent(u.searchParams.get('time_range')))
  if (range === 'LAST_MONTH') {
    const capturedDay=new Date(capture.captured_at).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'})
    const first=capturedDay.slice(0,7)+'-01'
    const end=new Date(Date.parse(first+'T12:00:00Z')-86400000).toISOString().slice(0,10)
    range={start:end.slice(0,7)+'-01',end}
  }
  if (!validDay(range.start) || !validDay(range.end) || range.start > range.end) throw Error('Invalid source range')
  const text = clean(capture.text)
  if (!text.includes('\nInstagram\n') || !text.includes(dateLabel(range.start)) || !text.includes(dateLabel(range.end))) throw Error('Rendered Instagram platform/date range not verified')
  if (audience && (!text.includes('Followers breakdown') || u.searchParams.get('audience_tab') !== 'trends')) throw Error('Audience Trends not selected')
  if (!Number.isFinite(Date.parse(capture.captured_at))) throw Error('Missing capture timestamp')
  return range
}
export function dailySeries(capture) {
  const range = sourceRange(capture)
  if (capture.tables?.length !== 6) throw Error('Expected six Results charts')
  const names = ['views_including_facebook_crossposts','reach','content_interactions','link_clicks','profile_visits','follows']
  return capture.tables.flatMap((table,i) => {
    // Earlier captures stored table objects; the current collector stores their text.
    const lines = (typeof table === 'string' ? table : table.text).split('\n')
    const dates = lines[0].trim().split('\t').map(s => new Date(Number(s)*1000).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'}))
    const values = lines[1]?.split('\t').slice(1).map(count)
    if (!values || dates.length !== values.length || new Set(dates).size !== dates.length) throw Error('Invalid chart series')
    return dates.flatMap((day,j) => {
      if (!validDay(day) || day < range.start || day > range.end) throw Error('Chart day outside rendered range')
      return values[j] === null ? [] : [{day,metric:names[i],value:values[j],observed_at:capture.captured_at,source_url:capture.url}]
    })
  })
}
export function nativePeriod(results,audience) {
  const range=sourceRange(results), ar=sourceRange(audience,{audience:true})
  if (range.start!==ar.start || range.end!==ar.end) throw Error('Period source ranges differ')
  const text=clean(results.text), views=[...text.matchAll(/([\d,]+) views/g)].map(m=>count(m[1]))
  const reach=/\nReach\s*\nExport\n([\d,.]+)(K?)/.exec(text)
  const unfollows=/\nUnfollows\s*\n([\d,]+)\n/.exec(clean(audience.text))
  if (views.length!==2 || !reach || !unfollows) throw Error('Native period values missing')
  const rows=dailySeries(results), days=Math.round((Date.parse(range.end)-Date.parse(range.start))/86400000)+1
  const sum=m=>{const values=rows.filter(r=>r.metric===m);return m!=='follows'&&values.length!==days?null:values.reduce((s,r)=>s+r.value,0)}
  const follows=sum('follows'), aFollows=count(/\nFollows\s*\n([\d,]+)\n/.exec(clean(audience.text))?.[1])
  if (aFollows!==follows) throw Error('Results and Audience follows differ')
  return {...range,days:Math.round((Date.parse(range.end)-Date.parse(range.start))/86400000)+1,observed_at:results.captured_at,source_url:results.url,audience_url:audience.url,metrics:{instagram_views:views[1],facebook_crosspost_views:views[0],unique_reach:Number(reach[1].replaceAll(',',''))*(reach[2]?1000:1),content_interactions:sum('content_interactions'),profile_visits:sum('profile_visits'),link_clicks:sum('link_clicks'),follows,unfollows:count(unfollows[1])},reach_rounded:!!reach[2],follower_through:rows.filter(r=>r.metric==='follows').at(-1)?.day??null}
}
export function postSnapshot(capture, previous=[]) {
  const u=new URL(capture.url)
  if(u.origin!=='https://business.facebook.com'||u.searchParams.get('asset_id')!==ASSET||u.searchParams.get('business_id')!==BUSINESS)throw Error('Wrong content account')
  const range=JSON.parse(decodeURIComponent(u.searchParams.get('time_range')))
  if(capture.sort!=='descending'||capture.filter!=='Instagram Feed'||!clean(capture.text).includes(dateLabel(range.start))||!clean(capture.text).includes(dateLabel(range.end)))throw Error('Post filter, dates or sort not verified')
  const rows=capture.rows.slice(0,12)
  if(rows.length!==12 || rows.some((r,i)=>count(r.cells[2])===null || (r.index!=null&&Number(r.index)!==i)))throw Error('Expected top twelve displayed posts with numeric views')
  const posts=rows.map((row,rank)=>{
    const c=row.cells,caption=c[0].split('\n')[0],m=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d+),/.exec(c[1])
    if(!m)throw Error('Unrecognized published date')
    const month=String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[1])+1).padStart(2,'0')
    const candidates=[]
    for(let year=Number(range.start.slice(0,4));year<=Number(range.end.slice(0,4));year++){const day=`${year}-${month}-${m[2].padStart(2,'0')}`;if(day>=range.start&&day<=range.end)candidates.push(day)}
    if(candidates.length!==1)throw Error('Publication year is ambiguous in the displayed source')
    const published_day=candidates[0]
    if(published_day<range.start||published_day>range.end)throw Error('Post outside publication range')
    const format=c[0].includes('\nCarousel')?'Carousel':c[0].includes('\nReel')?'Reel':'Post'
    const author=c[0].split('\n').filter(s=>s&& !['Boost','Open Dropdown','Crossposted','\u200b',format].includes(s)).slice(1).join(' / ')
    const identity_key=createHash('sha256').update(JSON.stringify([published_day,c[1],caption,author])).digest('hex')
    const old=previous.find(p=>p.identity_key===identity_key)
    const permalink=(row.links??[]).find(s=>/^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?$/.test(s))??old?.permalink??null
    const metric_observed_at={},retained_metrics=[]
    const metrics=Object.fromEntries(Object.entries({views:2,reach:3,interactions:5,likes:6,comments:7,shares:8,saves:9,follows:12}).map(([k,j])=>{const fresh=count(c[j]),value=fresh??old?.metrics?.[k]??null;metric_observed_at[k]=fresh!==null?capture.captured_at:old?.metric_observed_at?.[k]??old?.observed_at??null;if(fresh===null&&value!==null)retained_metrics.push(k);return [k,value]}))
    return {identity_key,rank:rank+1,published_day,caption,format,permalink,metric_observed_at,retained_metrics,ownership:c[0].includes('\n630volleyball')||c[0].includes('630 Volleyball, 630volleyball')?'account shown':'shared author; ownership unverified',metrics,observed_at:capture.captured_at,source_url:capture.url}
  })
  if(new Set(posts.map(p=>p.identity_key)).size!==12||posts.some((p,i)=>i&&p.metrics.views>posts[i-1].metrics.views))throw Error('Snapshot uniqueness or sort failed')
  return {start:range.start,end:range.end,scope:'top 12 lifetime performance; not a complete inventory',observed_at:capture.captured_at,posts}
}
export function validateReport(report) {
  if(report.version!==1||report.account!==ACCOUNT||report.instagram_id!==IG_ID||!validDay(report.through_day)||!Number.isFinite(Date.parse(report.captured_at)))throw Error('Invalid report identity/date')
  const keys=new Set(), metrics=new Set(['views_including_facebook_crossposts','reach','content_interactions','link_clicks','profile_visits','follows','unfollows'])
  for(const r of report.daily){const key=r.day+'/'+r.metric;if(keys.has(key)||!metrics.has(r.metric)||!Number.isFinite(Date.parse(r.observed_at))||!validDay(r.day)||r.day>report.through_day||!Number.isInteger(r.value)||r.value<0)throw Error('Invalid or duplicate daily value');keys.add(key)}
  for(const p of report.periods){if(!validDay(p.start)||!validDay(p.end)||p.start>p.end||p.end>report.through_day||p.days!==Math.round((Date.parse(p.end)-Date.parse(p.start))/86400000)+1)throw Error('Invalid period dates');for(const v of Object.values(p.metrics))if(v!==null&&(!Number.isFinite(v)||v<0))throw Error('Invalid period metric')}
  if(report.snapshot.posts.length!==12||new Set(report.snapshot.posts.map(p=>p.identity_key)).size!==12)throw Error('Invalid post snapshot')
  return report
}
const sqlString=s=>`'${String(s).replaceAll("'","''")}'`
export function reportSql(report) {
  validateReport(report)
  // An older reimport cannot undo a newer observation. Missing values create no rows.
  const groups=Map.groupBy(report.daily,r=>r.observed_at)
  const daily=[...groups].map(([observed,rows])=>importSql({account:ACCOUNT,rows,observed})).join('\n')
  return daily+`\nINSERT INTO business_suite_reports VALUES (${sqlString(ACCOUNT)},${sqlString(report.captured_at)},${sqlString(report.through_day)},${sqlString(JSON.stringify(report))}) ON CONFLICT (account,captured_at) DO NOTHING;\n`
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=JSON.parse(readFileSync(process.argv[2],'utf8'))
  process.stdout.write(reportSql(report))
}
