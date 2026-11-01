import { centralMidnight } from './story-time.js'
import { addDays, isDay } from '../../worker/src/insights.js'
export const STORY_KINDS={coaching:'Coaching',player_community:'Player / community',tournament:'Tournament coverage',promotion:'Promotion',other:'Other'}
export const LEDGER_SQL={
  count:`SELECT COUNT(*) n FROM media m LEFT JOIN story_content c USING(media_id) WHERE m.account='630' AND m.media_product_type='STORY' AND substr(m.published_at,1,19) >= ?1 AND substr(m.published_at,1,19) < ?2 AND (?3='' OR COALESCE(c.content_kind,'unclassified')=?3)`,
  rows:`SELECT m.*,c.title,c.content_kind,c.sequence_key,c.slide_position,c.elements_json,c.label_source,c.labeled_at,c.preview_key,c.preview_captured_at,c.preview_status FROM media m LEFT JOIN story_content c USING(media_id) WHERE m.account='630' AND m.media_product_type='STORY' AND substr(m.published_at,1,19) >= ?1 AND substr(m.published_at,1,19) < ?2 AND (?3='' OR COALESCE(c.content_kind,'unclassified')=?3) ORDER BY m.published_at DESC,m.media_id LIMIT 25 OFFSET ?4`,
  metrics:`SELECT s.* FROM media_metric_snapshots s WHERE s.media_id=?1 AND s.observed_at=(SELECT MAX(x.observed_at) FROM media_metric_snapshots x WHERE x.media_id=s.media_id AND x.metric=s.metric)`,
  comparable:`SELECT * FROM (SELECT m.media_id,m.published_at,c.content_kind,r.value reach,i.value interactions,r.observed_at,
    ROW_NUMBER() OVER(PARTITION BY m.media_id ORDER BY r.observed_at DESC) position
    FROM media m LEFT JOIN story_content c USING(media_id)
    JOIN story_metric_observations r ON r.media_id=m.media_id AND r.metric='reach'
    JOIN story_metric_observations i ON i.media_id=r.media_id AND i.metric='total_interactions' AND i.observed_at=r.observed_at
    WHERE m.account='630' AND m.media_product_type='STORY' AND substr(m.published_at,1,19)>=?1 AND substr(m.published_at,1,19)<?2
    AND (?3='' OR COALESCE(c.content_kind,'unclassified')=?3)
    AND (julianday(r.observed_at)-julianday(substr(m.published_at,1,19)))*24 BETWEEN 22 AND 24) WHERE position=1 ORDER BY published_at DESC LIMIT 1001`,
}
export const centralParts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'long',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value.replace(/\+0000$/,'Z'))).filter(p=>['weekday','hour'].includes(p.type)).map(p=>[p.type,p.value]))
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null}
export function compareStories(rows,dimension) {
  const groups=new Map()
  for(const r of rows) {
    const parts=centralParts(r.published_at)
    const key=dimension==='kind'?(STORY_KINDS[r.content_kind]??'Unclassified'):dimension==='weekday'?parts.weekday:`${String(Math.floor(Number(parts.hour)/4)*4).padStart(2,'0')}:00–${String(Math.floor(Number(parts.hour)/4)*4+4).padStart(2,'0')}:00`
    const group=groups.get(key)??[];group.push(r);groups.set(key,group)
  }
  return [...groups].map(([label,rows])=>({label,n:rows.length,reach:median(rows.map(r=>r.reach)),actionsPer100:median(rows.map(r=>r.reach>0?r.interactions/r.reach*100:null)),rateN:rows.filter(r=>r.reach>0).length}))
}
export async function loadStoryLedger(db,params,now=new Date()) {
  // Publication filters use Central calendar dates. Source metrics keep their own timestamps.
  const day=now.toLocaleDateString('en-CA',{timeZone:'America/Chicago'})
  const end=isDay(params.get('to'))?params.get('to'):day
  const start=isDay(params.get('from'))?params.get('from'):addDays(end,-29)
  if(start>end||Date.parse(end)-Date.parse(start)>365*86400000)throw new RangeError('Choose up to 366 days, with From before To.')
  const kind=Object.hasOwn(STORY_KINDS,params.get('kind'))||params.get('kind')==='unclassified'?params.get('kind'):''
  // Derive Central midnight through the shared timezone calendar helper, including DST.
  const args=[centralMidnight(start),centralMidnight(addDays(end,1)),kind]
  const count=await db.prepare(LEDGER_SQL.count).bind(...args).first()
  const pages=Math.max(1,Math.ceil(count.n/25)),page=Math.min(pages,Math.max(1,Number.parseInt(params.get('page'),10)||1))
  const [{results:rows},{results:comparison}]=await db.batch([db.prepare(LEDGER_SQL.rows).bind(...args,(page-1)*25),db.prepare(LEDGER_SQL.comparable).bind(...args)])
  const metrics=rows.length?await db.batch(rows.map(r=>db.prepare(LEDGER_SQL.metrics).bind(r.media_id))):[]
  return {start,end,kind,page,pages,total:count.n,comparisonTruncated:comparison.length>1000,comparisonCount:Math.min(comparison.length,1000),comparisons:Object.fromEntries(['kind','weekday','hour'].map(d=>[d,compareStories(comparison.slice(0,1000),d)])),rows:rows.map((r,i)=>({...r,metrics:Object.fromEntries(metrics[i].results.map(s=>[s.metric,s])),elements:r.elements_json?JSON.parse(r.elements_json):null})),now:now.toISOString()}
}
