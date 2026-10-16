/** Browser behavior for the selected question-led dashboard. No network writes. */
export function dashboardClient(data, help) {
  const $ = s => document.querySelector(s)
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-US', {maximumFractionDigits:1}) : 'Not reported'
  const finite = Number.isFinite
  const date = d => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : 'Not recorded'
  const time = t => {
    const d = new Date(String(t).replace(/\+0000$/, 'Z'))
    return Number.isFinite(d.getTime()) ? d.toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' Central' : 'Not recorded'
  }
  const range = w => w ? `${date(w.start)} – ${date(w.end)}` : 'No reporting period yet'
  const names = {overview:'Overview',posts:'Posts',stories:'Stories',audience:'Audience',status:'Data status'}
  const metrics = {reach:'reach',views:'views',saves:'saved',shares:'shares',likes:'likes',comments:'comments'}
  const metricValue = (p,k) => p.metrics[metrics[k]] ?? (k==='likes'?p.metrics.like_count:k==='comments'?p.metrics.comments_count:null)
  const metricTime = (p,k) => p.observedAt[metrics[k]] ?? (k==='likes'?p.observedAt.like_count:k==='comments'?p.observedAt.comments_count:null)
  const hp = (key,label) => `<button class="text-button" data-help="${key}">${label}</button>`
  const button = (page,label,classes='text-button',extra='') => `<button class="${classes}" data-page="${page}" ${extra}>${label}</button>`
  const type = p => p.type==='REELS'?'Reel':p.type==='STORY'?'Story':p.mediaType==='CAROUSEL_ALBUM'?'Carousel':'Photo'
  const title = p => { const s=String(p.caption??'').replace(/\s+/g,' ').trim(); return e(s ? s.length>110?s.slice(0,107)+'…':s : `${type(p)} published ${time(p.publishedAt)}`) }
  let ui, drawerTrigger, postTrigger
  function readURL() {
    const params=new URLSearchParams(location.search)
    ui={page:'overview',question:'reach',sort:'reach',format:'All',search:params.get('search')??'',scope:params.get('scope')==='overview'?'overview':''}
    for(const [k,allowed] of Object.entries({page:Object.keys(names),question:['reach','posts','followers'],sort:Object.keys(metrics),format:['All','Reel','Carousel','Photo']})) if(allowed.includes(params.get(k)))ui[k]=params.get(k)
  }
  function saveURL(push=false) {
    const url=new URL(location);url.search=new URLSearchParams({...ui,period:data.period,postsPeriod:data.postsPeriod}).toString()
    history[push?'pushState':'replaceState'](null,'',url)
  }
  function header(title,description,topic) {
    return `<header class="page-top"><div><p class="eyebrow">630 Volleyball · Instagram</p><h1>${title}</h1><p class="muted small">${description}</p></div><div class="page-tools"><a class="text-button" href="/business-suite">Business Suite report</a><button class="quiet" data-help="${topic}">Help with this page</button>${button('status','Data status','text-button mobile-status')}</div></header>`
  }
  function period(kind='activity') {
    const isPosts=kind==='posts', scoped=isPosts&&ui.scope==='overview'
    const w=isPosts&&!scoped?data.postsWindow:data.window
    const select=isPosts?'postsPeriod':'period', chosen=isPosts?data.postsPeriod:data.period
    return `<div class="period-line"><div><strong>${isPosts?'Published ':''}${range(w)}</strong>${!isPosts&&w?.previous?`<br><span>Compared with ${range(w.previous)}</span>`:''}</div><label>${isPosts?'Publication dates':'Reporting days'} <select id="${select}">${scoped?'<option value="overview" selected>From Overview</option>':''}${Object.entries({7:'7 days',30:'30 days',all:'All recorded'}).map(([k,v])=>`<option value="${k}" ${!scoped&&chosen===k?'selected':''}>${v}</option>`).join('')}</select></label></div><p class="small muted date-note">${isPosts?'Lifetime totals as last read. Publication dates use Los Angeles reporting days; exact timestamps below are Central.':'Instagram reporting days use Los Angeles time. The newest two reporting days are left out because Instagram may revise them.'} ${hp(isPosts?'lifetime':'comparison','About these dates')}</p>`
  }
  function notice(job='daily') {
    const r=data.runs[job]
    if(!r.needsAttention&&!r.overdue)return ''
    return `<div class="notice" role="status"><strong>${r.overdue?'An update is overdue.':'The latest update did not fully succeed.'}</strong>Last fully successful ${job==='daily'?'daily update':'Story check'}: ${time(r.success?.finished_at)}. These sections show their own reading dates. ${button('status','See what needs attention')}</div>`
  }
  function empty(label='No daily results are recorded for these dates.') {
    return `<section class="empty"><h2>${label}</h2><p>This does not mean there was no activity. Check Data status for missing readings and the next scheduled update.</p>${button('status','Check data status','primary')}</section>`
  }
  function nextMissing() {
    return `<section class="next"><p class="eyebrow">What to do next</p><h3>Check the missing readings.</h3><p>Use the recorded days as partial evidence. Check the affected dates before judging the full period.</p>${button('status','Check missing results','primary')}<p style="margin-top:16px">You can also ${button('posts','inspect recorded post results')} separately.</p></section>`
  }
  function reachChart() {
    const current=data.series, before=data.previous, all=[...current,...before].map(d=>d.reach).filter(finite)
    const maximum=Math.max(1,...all), top=Math.ceil(maximum/10**Math.floor(Math.log10(maximum)))*10**Math.floor(Math.log10(maximum))
    const x=i=>44+i*432/Math.max(1,current.length-1), y=n=>174-n/top*144
    const path=rows=>{let start=true;return rows.map((d,i)=>{if(!finite(d.reach)){start=true;return ''}const s=`${start?'M':'L'}${x(i)},${y(d.reach)}`;start=false;return s}).join(' ')}
    const tick=[...new Set([0,Math.floor((current.length-1)/2),current.length-1])].filter(i=>i>=0)
    const missing=data.coverage.reach.missing
    return `<svg class="chart" viewBox="0 0 510 210" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">Daily accounts reached</title><desc id="chart-description">${missing.length?`${missing.length} days are missing. The blue line breaks at each gap.`:'All selected days are recorded.'} Read exact values and dates in the table below.</desc>${[0,top/2,top].map(n=>`<line class="gridline" x1="44" x2="476" y1="${y(n)}" y2="${y(n)}"/><text x="35" y="${y(n)+4}" text-anchor="end">${n>=1000?fmt(n/1000)+'k':fmt(n)}</text>`).join('')}${before.length?`<path class="chart-before" d="${path(before)}"/>`:''}<path class="chart-line" d="${path(current)}"/>${current.map((d,i)=>finite(d.reach)?`<circle cx="${x(i)}" cy="${y(d.reach)}" r="3" fill="var(--blue)"/>`:'').join('')}${tick.map(i=>`<text x="${x(i)}" y="202" text-anchor="middle">${date(current[i].day).replace(/, \d{4}$/,'')}</text>`).join('')}</svg><div class="legend"><span>Selected period</span>${before.length?'<span>Previous period · aligned by day in period</span>':''}</div>${missing.length?`<p class="chart-missing">Missing reach: ${missing.map(date).join('; ')}.</p>`:''}<details><summary>Read the chart as a table</summary><div class="table-wrap recorded-days"><table><thead><tr><th>Day</th><th>Reach</th>${before.length?'<th>Previous day</th><th>Reach</th>':''}</tr></thead><tbody>${current.map((d,i)=>`<tr><td>${date(d.day)}</td><td>${fmt(d.reach)}</td>${before.length?`<td>${date(before[i]?.day)}</td><td>${fmt(before[i]?.reach)}</td>`:''}</tr>`).join('')}</tbody></table></div></details>`
  }
  function followSummary() {
    const s=data.summary
    const insight=data.followerInsight
    return `<div class="flow"><div><strong>${fmt(s.follows)}</strong><span>followed</span></div><div><strong>${fmt(s.unfollows)}</strong><span>unfollowed</span></div></div><p>${finite(s.net)?`<strong>${s.net>0?'+':''}${fmt(s.net)} net new follows</strong> during these dates.`:'A complete net change is unavailable because daily readings are missing.'}</p>${hp('followers','How to read follower change')} ${hp('definitions','Compare with the weekly scorecard')}${insight?`<section class="rule-section"><h3>Does this call for action?</h3><p><strong>${e(insight.heading)}</strong></p><p>${e(insight.detail)}</p><p>${e(insight.action)}</p>${insight.state==='incomplete'?'<button class="text-button" data-page="status">Check missing readings in Data status</button>':''}</section>`:''}<section class="rule-section"><h3>Did Instagram bring website visits?</h3><p><a href="https://us.posthog.com/project/579364/dashboard/2037580" target="_blank" rel="noopener noreferrer">Open website visits and registration handoffs</a></p><p>Website visits and handoffs use separate Central-time reporting days. A handoff is a click toward registration.</p>${hp('registration','What can this tell us?')}</section><section class="rule-section"><h3>Can we tell who left?</h3><p>Compare complete dated exports in Follower snapshots to see added and absent handles. Daily counts alone cannot identify who left.</p><p><a href="/followers">Open follower snapshots</a></p>${hp('snapshots','How handle comparisons work')}</section>`
  }
  function followerChart() {
    // Each reporting day remains visible. A table is more legible than hundreds of bars.
    const rows=data.series, max=Math.max(1,...rows.flatMap(d=>[d.follows,d.unfollows]).filter(finite))
    const cell=560/Math.max(1,rows.length), width=Math.min(20,cell*.3)
    const chart=rows.length<=30?`<svg class="chart" viewBox="0 0 650 205" role="img" aria-label="Daily follows and unfollows. Blue is followed, orange is unfollowed. Missing values use a question mark. Exact values follow in a table.">${[0,max/2,max].map(n=>`<line x1="40" x2="620" y1="${155-n/max*125}" y2="${155-n/max*125}" stroke="var(--line)"/><text x="32" y="${159-n/max*125}" text-anchor="end">${fmt(n)}</text>`).join('')}${rows.map((d,i)=>{const x=48+i*cell;return ['follows','unfollows'].map((key,j)=>finite(d[key])?`<rect x="${x+j*width}" y="${155-d[key]/max*125}" width="${width-1}" height="${d[key]/max*125}" fill="var(--${j?'orange':'blue'})"/>${rows.length<=7?`<text x="${x+j*width+width/2}" y="${147-d[key]/max*125}" text-anchor="middle">${fmt(d[key])}</text>`:''}`:`<text x="${x+j*width}" y="145">?</text>`).join('')+(i===0||i===rows.length-1||i===Math.floor(rows.length/2)?`<text x="${x}" y="188" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}">${date(d.day).replace(/, \d{4}$/,'')}</text>`:'')}).join('')}</svg><p class="small">Blue: followed · Orange: unfollowed · ?: not reported</p>`:''
    return chart+`<details ${rows.length>30?'open':''}><summary>Read follower changes as a table</summary><div class="table-wrap recorded-days"><table><thead><tr><th>Day</th><th>Followed</th><th>Unfollowed</th></tr></thead><tbody>${rows.map(d=>`<tr><td>${date(d.day)}</td><td>${fmt(d.follows)}</td><td>${fmt(d.unfollows)}</td></tr>`).join('')}</tbody></table></div></details>`
  }
  function coverageNote() { return `<div class="coverage"><p>Only posts 630 published are included. Some Collab posts are missing.</p>${hp('collabs','Why?')}</div>` }
  function sortPosts(rows,metric) {return [...rows].sort((a,b)=>(finite(metricValue(b,metric))?metricValue(b,metric):-1)-(finite(metricValue(a,metric))?metricValue(a,metric):-1))}
  function postTable(rows,metric=ui.sort) {
    return `<div class="table-wrap mobile-cards"><table><thead><tr><th>Post</th><th>Published</th><th aria-sort="descending">Lifetime ${metric} ↓</th><th>Metric last read</th></tr></thead><tbody>${rows.map(p=>`<tr><td><button class="post-link" data-post="${e(p.id)}">${title(p)}</button><small>${type(p)} · ${p.ageDays} days since publication</small></td><td data-label="Published">${time(p.publishedAt)}</td><td data-label="Lifetime ${metric}"><strong>${fmt(metricValue(p,metric))}</strong></td><td data-label="${metric} last read">${time(metricTime(p,metric))}</td></tr>`).join('')}</tbody></table></div>`
  }
  function overview() {
    const qs=[['reach','Are more accounts seeing us?','Understand how widely content is seen.'],['posts','What should we learn from?','Find content worth a closer look.'],['followers','How did follower numbers change?','Read follows and unfollows together.']]
    const chooser=`<div class="question-grid blend-questions" aria-label="Choose a question">${qs.map(([key,title,sub])=>`<button class="question ${ui.question===key?'active':''}" data-question="${key}" aria-pressed="${ui.question===key}"><strong>${title}</strong><span>${sub}</span></button>`).join('')}</div><div class="question-picker"><label for="question-picker">Your question</label><select id="question-picker">${qs.map(([key,title])=>`<option value="${key}" ${ui.question===key?'selected':''}>${title}</option>`).join('')}</select></div>`
    const why={reach:['Why look at reach?','Reach tells you how widely content was seen. Check the account trend before judging individual posts. More reach does not by itself mean more registrations.'],posts:['Why look at saves?','Saves may point to content someone wanted to return to. Inspect the content, its format, and its age before choosing one feature to try again.'],followers:['Why read both numbers?','A small net change can hide movement in both directions. Look at follows and unfollows together before deciding whether to change the content plan.']}[ui.question]
    let answer='', s=data.summary
    if(ui.question==='posts') {
      const rows=sortPosts(data.overviewPosts,'saves').slice(0,3)
      answer=rows.length?`<section class="finding"><h2>Start with the posts people saved.</h2><p>Compare similar formats and post ages. These are lifetime totals as last read, not results earned only during these dates.</p></section>${coverageNote()}${postTable(rows,'saves')}<section class="next"><h3>Choose a post, then look for one feature to test.</h3><p>Open a title above to inspect it, or compare the full list before choosing.</p>${button('posts','Compare all posts by saves','primary','data-sort="saves" data-scope="overview"')}</section>`:empty('No collected posts were published in these dates.')
    } else if(data.empty)answer=empty()
    else if(ui.question==='reach') {
      const heading=!data.coverage.reach.complete?'We can’t compare this period yet.':!s.comparable?'Here is the reach recorded for these dates.':s.typical>s.previousTypical?'More accounts saw 630 on a typical day.':s.typical<s.previousTypical?'Fewer accounts saw 630 on a typical day.':'Typical daily reach stayed the same.'
      const detail=!data.coverage.reach.complete?`${data.coverage.reach.missing.length} of ${data.series.length} reach readings are missing. The chart shows the available days.`:`Typical daily reach was ${fmt(s.typical)} accounts.${s.comparable?` The previous period was ${fmt(s.previousTypical)}.${s.ratio===1?' Typical daily reach did not change.':s.ratio!==null?` That is ${fmt(Math.abs((s.ratio-1)*100))}% ${s.ratio>=1?'higher':'lower'}.`:' The earlier value was zero, so a percentage change is unavailable.'}`:data.period==='all'?' All recorded dates have no earlier comparison period.':' The previous period is incomplete, so no change is calculated.'}`
      const next=!data.coverage.reach.complete?nextMissing():`<section class="next"><p class="eyebrow">What to inspect next</p><h3>Look at the posts from these dates.</h3><p>Compare their reach and content. Check each metric’s reading date. A matching publication date does not prove a post caused the account-wide change.</p>${button('posts',data.runs.daily.overdue?'Inspect dated post results':'Inspect posts from these dates','primary','data-sort="reach" data-scope="overview"')}</section>`
      answer=`<section class="finding"><h2>${heading}</h2><p>${detail}</p></section><div class="dashboard-grid"><section class="evidence"><h3>Accounts reached on a typical day</h3><div class="metric">${finite(s.typical)?fmt(s.typical):'Unavailable'} ${s.comparable?`<small>vs ${fmt(s.previousTypical)} before</small>`:''}</div>${hp('median','What is a typical day?')}${reachChart()}<p class="small muted" style="margin-top:16px">Daily reach counts different accounts each day. Don’t add days together.</p></section><aside>${next}</aside></div>`
    } else {
      answer=`<section class="finding"><h2>${finite(s.net)?s.net>0?`There were ${fmt(s.net)} more follows than unfollows.`:s.net<0?`There were ${fmt(-s.net)} more unfollows than follows.`:'Follows and unfollows were equal.':'We can’t calculate a complete follower change.'}</h2><p>These counts do not tell us who left or why.</p></section><div class="dashboard-grid"><section>${followSummary()}${followerChart()}</section><aside>${finite(s.net)?`<section class="next"><h3>Put the change in context.</h3><p>See follower change beside the latest available follower snapshot.</p>${button('audience','Explore the audience','primary')}</section>`:nextMissing()}</aside></div>`
    }
    return header('Start with a question','Understand why the numbers matter, then decide what to inspect.',ui.question)+period()+notice()+chooser+`<div class="question-answer blend-answer"><section class="question-purpose"><h3>${why[0]}</h3><p>${why[1]}</p></section>${answer}</div>`
  }
  function postsPage() {
    const source=ui.scope==='overview'?data.overviewPosts:data.posts
    const rows=sortPosts(source.filter(p=>(ui.format==='All'||type(p)===ui.format)&&String(p.caption??'').toLowerCase().includes(ui.search.toLowerCase())),ui.sort)
    return header('Which posts are worth learning from?','Use saves, shares, or reach to choose content for a closer look.','posts')+period('posts')+notice()+coverageNote()+`<div class="filters"><label class="search">Find a post<input id="search" type="search" value="${e(ui.search)}" placeholder="Search caption"></label><label>Format<select id="format">${['All','Reel','Carousel','Photo'].map(f=>`<option ${ui.format===f?'selected':''}>${f}</option>`).join('')}</select></label><label>Compare by<select id="sort">${Object.keys(metrics).map(k=>`<option value="${k}" ${ui.sort===k?'selected':''}>${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></label></div><div id="post-results" aria-live="polite">${rows.length?postTable(rows):source.length?'<div class="empty"><h2>No posts match these filters.</h2><button class="quiet" id="clear-filters">Clear filters</button></div>':empty('No collected posts were published in these dates.')}</div><p class="small muted" style="margin-top:20px">${rows.length} of ${source.length} collected posts shown. Compare age and last reading before treating a rank as a useful pattern.</p>${hp('lifetime','How to compare lifetime totals')}`
  }
  function storiesPage() {
    return header('What did people do after seeing a Story?','Use the actions to decide what to inspect; link taps alone do not establish registrations.','stories')+`<div class="period-line"><strong>Published ${range(data.storiesWindow)}</strong><span>Last 7 days · independent of Overview</span></div>`+notice('stories')+`<p class="muted">First recorded Story: ${time(data.storiesSince)}. Expired Stories keep their last captured reading; that reading may be incomplete.</p>`+(data.stories.length?`<div class="table-wrap mobile-cards"><table><thead><tr><th>Story</th><th>Reach</th><th>Link taps</th><th>Last captured</th></tr></thead><tbody>${data.stories.map(p=>`<tr><td><button class="post-link" data-post="${e(p.id)}">${time(p.publishedAt)}</button><small>${p.live?'Published less than 24 hours ago':'Expired'} · inspect actions</small></td><td data-label="Reach">${fmt(p.metrics.reach)}<small>${time(p.observedAt.reach)}</small></td><td data-label="Link taps">${fmt(p.metrics.link_clicks)}<small>${time(p.observedAt.link_clicks)}</small></td><td data-label="Last captured">${time(p.lastRead)}</td></tr>`).join('')}</tbody></table></div>`:empty('No Stories were captured for these dates.'))+`<section class="rule-section"><h2>Inspect one Story’s actions.</h2><p>Open its date above. Next slide, next account, back, and exit are different actions. Missing values are never treated as zero.</p>${hp('stories','How to interpret Story actions')}</section><section class="next" style="margin-top:24px"><h3>Link taps are a first step.</h3><p>Check the destination before drawing a conclusion about registrations.</p>${hp('registration','Where registration results belong')}</section>`
  }
  function bars(rows) {
    const max=Math.max(1,...rows.map(r=>r.value))
    return rows.length?`<ul class="bars">${rows.map(r=>`<li><span>${e(r.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${r.value/max*100}%"></span></span><span class="number">${fmt(r.value)}</span></li>`).join('')}</ul>`:'<p>Not reported.</p>'
  }
  function audiencePage() {
    const a=data.audience
    return header('How is our audience changing?','Read follows and unfollows over time, then use the latest follower snapshot for context.','audience')+period()+notice()+`<section><h2>Follower change during these dates</h2>${data.empty?empty():followSummary()+followerChart()}</section><section class="rule-section"><h2>Who follows 630?</h2><p>${finite(data.followers?.followers_count)?`<strong>${fmt(data.followers.followers_count)} followers</strong> when read ${time(data.followers.observed_at)}.`:'Follower count has not been reported.'}</p><p class="muted">Audience categories recorded on ${date(a.day)}. This snapshot is separate from the dates above; each category has its own reading time.</p><div class="audience-grid"><section><h3>Top reported cities</h3><p class="small muted">Last read: ${time(a.cityReadAt)}</p>${bars(a.cities.map(r=>({label:r.dimension,value:r.value})))}<p class="small muted">Showing ${a.cities.length} of ${a.cityCount} reported cities. Reported cities cover only part of the audience.</p></section><section><h3>Reported age groups</h3><p class="small muted">Last read: ${time(a.ageReadAt)}</p>${bars(a.ages.map(r=>({label:r.age,value:r.value})))}<p class="small muted">Age does not identify whether someone is a parent or an athlete. Categories may leave out followers.</p></section></div>${hp('audience','Who is missing from this snapshot?')}</section><section class="rule-section"><h3>When should we post?</h3><p>Posting-time guidance is not available yet. Ask the dashboard maintainer to verify the online-hour timezone and coverage before enabling it.</p>${hp('audience','What online hours can and cannot tell us')}</section>`
  }
  function statusPage() {
    const suite=data.businessSuiteStatus, report=suite?.report, attempt=suite?.attempt
    const suiteStatus=`<section class="status-row"><div><h3>Business Suite report</h3><span class="state-label">${attempt?.state==='error'?'Latest update failed':report?'Saved native report':'Not recorded'}</span></div><div><p>Last saved report: ${time(report?.captured_at)}.</p><p>Source days through ${date(report?.through_day)}. Reporting days use Los Angeles time.</p>${attempt?`<p>Latest attempt: ${time(attempt.finished_at)} · ${attempt.state==='ok'?'successful':'failed; last good report retained'}.</p>`:''}<p class="small muted">Native period reach, crosspost views, profile visits, link clicks and the top-12 lifetime post snapshot have separate source definitions from API activity.</p></div><div><a href="/business-suite">Inspect Business Suite report</a></div></section>`

    const runRow=(label,job,scope)=>{const r=data.runs[job];return `<section class="status-row"><div><h3>${label}</h3><span class="state-label">${!r.attempt?'Waiting for first reading':r.overdue?'Update overdue':r.needsAttention?'Update needs attention':'Latest update succeeded'}</span></div><div><p>${scope}</p><p>Last fully successful reading: ${time(r.success?.finished_at)}</p></div><div><p>Latest attempt: ${time(r.attempt?.finished_at)}${r.attempt?` · ${e({ok:'succeeded',partial:'partly succeeded',missing_scope:'access permission missing',token_invalid:'access needs renewal',error:'failed'}[r.attempt.state]??'unknown')}`:''}</p><p class="small muted">Next scheduled check: ${time(r.nextAt)}</p></div></section>`}
    const missing=Object.entries(data.coverage).filter(([,c])=>c.missing.length)
    return header('Can I rely on these results?','Check what is current, what is missing, and what needs attention.','freshness')+`<p>Each section has its own reading. An update reads earlier reporting days; its date is not an extra day of results. A recent attempt is not always a successful update.</p><div class="status-list">${suiteStatus}${runRow('Daily activity','daily',`Latest recorded reach day: ${date(data.dailyThrough)}. Reach last read: ${time(data.dailyReadAt)}.`)}<section class="status-row"><div><h3>Post results</h3><span class="state-label">Dated lifetime readings</span></div><div><p>Each metric keeps its own reading time.</p><p class="small muted">The collector revisits recent posts for 14 days. Older readings are not final totals.</p></div><div>${button('posts','Inspect post readings')}</div></section>${runRow('Stories','stories','Live Stories are checked hourly at :45. Expired does not mean fully captured.')}<section class="status-row"><div><h3>Audience</h3><span class="state-label">${data.audience.observedAt?'Snapshot':'Not reported'}</span></div><div><p>Latest category reading: ${time(data.audience.observedAt)}</p><p>Follower count read: ${time(data.followers?.observed_at)}</p></div><div>${button('audience','Read the snapshot')}</div></section></div><section class="rule-section"><h2>Coverage for ${range(data.window)}</h2><p>${data.previous.length?`Previous reach period: ${data.previous.filter(d=>finite(d.reach)).length} of ${data.previous.length} days recorded.`:'No previous comparison period is selected.'}</p>${!data.window?'<p>No daily reporting period is available yet.</p>':missing.length?missing.map(([key,c])=>`<details><summary>${key[0].toUpperCase()+key.slice(1)}: ${c.recorded} of ${c.expected} days recorded</summary><p class="small">Missing: ${c.missing.map(date).join('; ')}</p></details>`).join(''):'<p>All selected daily readings are present.</p>'}</section><section class="next" style="margin-top:24px"><h3>Use complete sections. Check gaps before changing the plan.</h3><p>If an update is overdue or access needs renewal, ask the dashboard maintainer to check the connection. Opening this page does not collect new data.</p>${hp('missing','Understand missing results')}</section><section class="rule-section"><h2>Known limits</h2><p>${hp('collabs','Some Collab posts are absent')}<br>${hp('registration','Registrations are not measured; API profile-link results are withheld')}<br>${hp('audience','Posting-time guidance needs verification')}</p><details><summary>For the maintainer</summary><p>Inspect the failed collection log and the affected dates. If Instagram access expired, renew it and update the collector credential. If access is valid, investigate the error before running collection again.</p><p>Daily collection runs at 14:30 UTC (9:30 AM Central in daylight time, 8:30 AM in standard time). Story checks run hourly at :45. The next check above uses the correct Central offset for that date.</p></details></section>`
  }
  function render(moveFocus=false,push=false) {
    $('#nav').innerHTML=['overview','posts','stories','audience'].map(p=>`<button data-page="${p}" ${ui.page===p?'aria-current="page"':''}>${names[p]}</button>`).join('')+'<a class="text-button" href="/followers">Follower snapshots</a>'
    $('#main').innerHTML=({overview,posts:postsPage,stories:storiesPage,audience:audiencePage,status:statusPage}[ui.page])()
    document.title=`${names[ui.page]} · 630 Instagram`
    saveURL(push)
    if(moveFocus){$('#main').focus();window.scrollTo(0,0)}
  }
  function openHelp(topic,trigger) {
    if(!Object.hasOwn(help,topic))topic='start'
    const h=help[topic];$('#topic').value=topic
    $('#help-body').innerHTML=`<h2 id="help-title">${h.title}</h2><h3>What it means</h3><p>${h.meaning}</p><h3>How to read it</h3><p>${h.read}</p><h3>What to do next</h3><p>${h.action}</p><h3>What it cannot tell you</h3><p>${h.limit}</p><div class="related"><h3>Related questions</h3>${h.related.map(k=>hp(k,help[k].title)).join('')}</div>`
    if(!$('#help').open){drawerTrigger=trigger||document.activeElement;$('#help').showModal()}
    $('#help').scrollTop=0
  }
  function openPost(id,trigger) {
    const p=[...data.posts,...data.overviewPosts,...data.stories].find(p=>p.id===id);if(!p)return
    let link=null
    try {const u=new URL(p.permalink);if(u.protocol==='https:'&&['www.instagram.com','instagram.com'].includes(u.hostname))link=u.href}catch{}
    const fields=p.type==='STORY'?[['Reach','reach'],['Link taps','link_clicks'],['Next slide','navigation:tap_forward'],['Next account','navigation:swipe_forward'],['Back','navigation:tap_back'],['Exited','navigation:tap_exit']]:Object.keys(metrics).map(k=>[k[0].toUpperCase()+k.slice(1),k])
    $('#post-body').innerHTML=`<div class="detail-top"><p class="eyebrow">${type(p)} · ${p.ageDays} days since publication</p><button class="quiet" data-close="post-detail">Close</button></div><h2 id="post-title">${title(p)}</h2><p class="small muted">Published ${time(p.publishedAt)} · lifetime totals as last read</p><dl>${fields.map(([label,key])=>{const n=p.type==='STORY'?p.metrics[key]:metricValue(p,key),t=p.type==='STORY'?p.observedAt[key]:metricTime(p,key);return `<div><dt>${label}</dt><dd>${fmt(n)}</dd><small>Read ${time(t)}</small></div>`}).join('')}</dl><section class="rule-section"><h3>What to inspect</h3><p>${p.type==='STORY'?'Keep next slide separate from next account. Missing link taps do not establish zero taps or the absence of a sticker.':'Look at the opening, the subject, and the reason someone might save or share it. Compare a similar post before choosing one feature to test.'}</p>${link?`<a class="primary" href="${e(link)}" target="_blank" rel="noopener noreferrer">Open on Instagram</a>`:'<p class="muted">An Instagram link is not available for this item.</p>'}${p.caption?`<details><summary>Read the full caption</summary><p class="caption">${e(p.caption)}</p></details>`:''}${hp(p.type==='STORY'?'stories':'lifetime','About these results')}</section>`
    postTrigger=trigger;$('#post-detail').showModal()
  }
  document.addEventListener('click',event=>{
    const close=event.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return}
    const h=event.target.closest('[data-help]');if(h){openHelp(h.dataset.help,h);return}
    const p=event.target.closest('[data-page]');if(p){ui.page=p.dataset.page;if(p.dataset.sort){ui.sort=p.dataset.sort;ui.search='';ui.format='All';ui.scope=p.dataset.scope??''}render(true,true);return}
    const post=event.target.closest('[data-post]');if(post){openPost(post.dataset.post,post);return}
    const q=event.target.closest('[data-question]');if(q){ui.question=q.dataset.question;render(false,true);$(`[data-question="${ui.question}"]`).focus();return}
    if(event.target.id==='clear-filters'){ui.search='';ui.format='All';render();$('#search').focus()}
  })
  document.addEventListener('change',event=>{
    const el=event.target
    if(['period','postsPeriod'].includes(el.id)){if(el.value==='overview')return;const u=new URL(location);u.searchParams.set(el.id,el.value);if(el.id==='postsPeriod')u.searchParams.delete('scope');location.assign(u);return}
    if(['sort','format'].includes(el.id)){ui[el.id]=el.value;render();$('#'+el.id).focus()}
    if(el.id==='topic')openHelp(el.value)
    if(el.id==='question-picker'){ui.question=el.value;render(false,true);$('#question-picker').focus()}
  })
  document.addEventListener('input',event=>{if(event.target.id==='search'){ui.search=event.target.value;const cursor=event.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(cursor,cursor)}})
  window.addEventListener('popstate',()=>{readURL();render(true)})
  $('#help').addEventListener('close',()=>drawerTrigger?.focus())
  $('#post-detail').addEventListener('close',()=>postTrigger?.focus())
  $('#topic').innerHTML=Object.entries(help).map(([key,h])=>`<option value="${key}">${h.title}</option>`).join('')
  readURL();render()
}
