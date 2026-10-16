/** Synthetic end-to-end checks in the same workerd runtime used by Cloudflare. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { seeded, PASSPHRASE, NOW } from './fixtures.mjs'
const require=createRequire(import.meta.url), wranglerRequire=createRequire(require.resolve('wrangler/package.json'))
const {Miniflare}=wranglerRequire('miniflare')
const out=resolve(process.env.DASHBOARD_CAPTURE_DIR??'.artifacts/insights-redesign/live-build')
mkdirSync(out,{recursive:true})
// Use the exact production packager. A generic esbuild bundle has different defaults.
const bundle=resolve(out,'bundle')
execFileSync(process.execPath,[require.resolve('wrangler/bin/wrangler.js'),'deploy','--dry-run','--config','scripts/social-publish/insights-dashboard/wrangler.jsonc','--outdir',bundle],{stdio:'pipe',timeout:60000})
const built=readFileSync(resolve(bundle,'index.js'),'utf8')
// Only the server's fixture clock is replaced after production packaging.
const clock=/now = (?:\/\* @__PURE__ \*\/ )?new Date\(\)/g
assert.equal((built.match(clock)??[]).length,1)
const script=built.replace(clock,`now = new Date('${NOW.toISOString()}')`)
const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-01-01',bindings:{DASHBOARD_PASSPHRASE:PASSPHRASE},d1Databases:['INSIGHTS_DB'],host:'127.0.0.1',port:0})
const browser=await chromium.launch({headless:true})
const errors=[], captures=[]
try {
  const db=await mf.getD1Database('INSIGHTS_DB')
  for(const name of ['0001_instagram_insights.sql','0002_stories_audience_online.sql']) {
    const sql=readFileSync(`scripts/social-publish/worker/migrations/${name}`,'utf8').replace(/--[^\n]*/g,'')
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run()
  }
  const source=seeded()
  for(const {name} of source.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const rows=source.sqlite.prepare(`SELECT * FROM ${name}`).all()
    for(let i=0;i<rows.length;i+=50)await db.batch(rows.slice(i,i+50).map(row=>db.prepare(`INSERT INTO ${name} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row))))
  }
  // A real row in the period, an entirely missing post, and a hostile caption exercise boundaries.
  await db.prepare("INSERT INTO media VALUES ('in-week','630','2026-10-10T20:00:00Z','IMAGE','FEED','https://www.instagram.com/p/example/','2026-10-10T20:00:00Z','2026-10-16T14:30:00Z','Example practice post')").run()
  for(const [metric,value] of [['reach',1200],['views',2400],['saved',26],['shares',18]])await db.prepare("INSERT INTO media_metric_snapshots VALUES ('in-week','2026-10-16',?,?, '2026-10-16T14:30:00Z')").bind(metric,value).run()
  await db.prepare("INSERT INTO media VALUES ('missing-post','630','2026-10-11T20:00:00Z','VIDEO','REELS','javascript:globalThis.attack=true','2026-10-11T20:00:00Z','2026-10-16T14:30:00Z','Unreported post </script><script>globalThis.attack=true</script>')").run()
  const base=String(await mf.ready), context=await browser.newContext({viewport:{width:1365,height:900}}), page=await context.newPage()
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
  const capture=async(name)=>{
    await page.evaluate(()=>{
      let note=document.getElementById('test-disclosure');if(!note){note=document.createElement('div');note.id='test-disclosure';note.style='padding:8px 20px;background:#26292d;color:white;font:12px Arial';document.body.prepend(note)}note.textContent='Mock — synthetic data. Every number and caption in this test is invented; do not quote it.'
    })
    const file=resolve(out,`${name}.png`);await page.screenshot({path:file,fullPage:!(await page.locator('dialog[open]').count())});captures.push({name,file,viewport:page.viewportSize()})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false,`${name}: no horizontal overflow`)
  }
  await page.goto(base);await page.getByLabel('Passphrase',{exact:true}).fill('wrong passphrase');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('alert').waitFor()
  await page.getByLabel('Passphrase',{exact:true}).fill(PASSPHRASE);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Start with a question'}).waitFor()
  // Make the overflow detector prove it can fail before using it on the real frames.
  assert.equal(await page.evaluate(()=>{const el=document.createElement('div');el.id='overflow-probe';el.style='width:3000px;height:2px';el.textContent='overflow detector probe';document.body.append(el);return document.documentElement.scrollWidth>document.documentElement.clientWidth+1}),true)
  await page.locator('#overflow-probe').evaluate(el=>el.remove())
  await capture('desktop-reach')
  await page.getByRole('button',{name:'What should we learn from?',exact:false}).click();await page.reload();assert.equal(await page.locator('[data-question="posts"]').getAttribute('aria-pressed'),'true');await capture('desktop-question-posts')
  await page.getByRole('button',{name:'Compare all posts by saves'}).click();assert.equal(await page.getByLabel('Compare by').inputValue(),'saves');assert.match(await page.locator('.period-line').innerText(),/From Overview/)
  await page.getByLabel('Find a post').fill('no-match');await page.getByRole('heading',{name:'No posts match these filters.'}).waitFor()
  await page.getByRole('button',{name:'Clear filters'}).click();await page.locator('[data-post="in-week"]').click();await page.getByRole('link',{name:'Open on Instagram'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('[data-post="in-week"]').evaluate(el=>el===document.activeElement),true)
  await page.locator('[data-post="missing-post"]').click();assert.equal(await page.getByRole('link',{name:'Open on Instagram'}).count(),0);assert.equal(await page.evaluate(()=>!!globalThis.attack),false);await page.keyboard.press('Escape')
  await page.getByLabel('Publication dates').selectOption('all');await page.getByRole('heading',{name:'Which posts are worth learning from?'}).waitFor();assert.equal(await page.getByLabel('Publication dates').inputValue(),'all')
  await page.getByLabel('Compare by').selectOption('reach');await capture('desktop-posts')
  await page.locator('#nav').getByRole('button',{name:'Stories',exact:true}).click();await capture('desktop-stories');await page.locator('[data-post="s1"]').click();assert.equal(await page.locator('#post-body dt').filter({hasText:'Next slide'}).count(),1);assert.match(await page.locator('#post-body').innerText(),/Not reported/);assert.match(await page.locator('#post-body').innerText(),/12/);await capture('desktop-story-detail');await page.keyboard.press('Escape')
  await page.locator('#nav').getByRole('button',{name:'Audience',exact:true}).click();await capture('desktop-audience')
  await page.locator('.rail-bottom').getByRole('button',{name:'Data status',exact:true}).click();await capture('desktop-status')
  await page.locator('#nav').getByRole('button',{name:'Overview',exact:true}).click();await page.locator('[data-question="followers"]').click();await capture('desktop-followers')
  await page.getByRole('button',{name:'Help with this page'}).click();assert.equal(await page.locator('#topic').inputValue(),'followers');await page.getByRole('heading',{name:'Follows, unfollows, and net change'}).waitFor();await capture('desktop-help')
  for(const option of await page.locator('#topic option').evaluateAll(els=>els.map(e=>e.value))){await page.locator('#topic').selectOption(option);assert.ok((await page.locator('#help-body').innerText()).includes('What to do next'))}
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Help with this page'}).evaluate(el=>el===document.activeElement),true)
  await page.setViewportSize({width:390,height:844})
  for(const q of ['reach','posts','followers']){await page.getByLabel('Your question').selectOption(q);await capture(`phone-question-${q}`)}
  for(const label of ['Posts','Stories','Audience']){await page.locator('#nav').getByRole('button',{name:label,exact:true}).click();await capture(`phone-${label.toLowerCase()}`)}
  await page.getByRole('button',{name:'Help with this page'}).click();await capture('phone-help');await page.keyboard.press('Escape')
  await page.locator('.mobile-status').click();await capture('phone-status')
  await db.prepare("DELETE FROM account_metric_days WHERE day='2026-10-10' AND metric IN ('reach','follows_and_unfollows:NON_FOLLOWER')").run()
  await page.goto(base+'?page=overview');await page.getByRole('heading',{name:'We can’t compare this period yet.'}).waitFor();assert.match(await page.locator('.chart-line').getAttribute('d'),/M.*M/);await capture('phone-missing')
  await page.getByLabel('Your question').selectOption('followers');await page.getByRole('heading',{name:'We can’t calculate a complete follower change.'}).waitFor()
  await db.prepare("INSERT INTO sync_runs(account,job,trigger,started_at,finished_at,state,days_complete,days_failed,day_values_written,media_read) VALUES('630','daily','cron','2026-10-16T15:00:00Z','2026-10-16T15:01:00Z','token_invalid',0,7,0,0)").run()
  await page.reload();await page.getByRole('status').waitFor();await capture('phone-failed-update')
  for(const name of ['account_metric_days','account_snapshots','media_metric_snapshots','media','audience_snapshots','sync_runs'])await db.prepare(`DELETE FROM ${name}`).run()
  await page.goto(base);await page.getByRole('heading',{name:'No daily results are recorded for these dates.'}).waitFor();await capture('phone-empty')
  await db.prepare('DROP TABLE account_metric_days').run();await page.reload();await page.getByRole('heading',{name:'Results could not be loaded.'}).waitFor();await capture('phone-load-error')
  // Only the intentionally rejected login and database-error request may emit HTTP console errors.
  assert.deepEqual(errors.filter(m=>!m.includes('401')&&!m.includes('503')),[])
  writeFileSync(resolve(out,'captures.json'),JSON.stringify(captures,null,2)+'\n')
  console.log(`PASS: ${captures.length} captures; workerd + D1 auth, dates, navigation, filters, safe captions/links, help, missing/failed/empty/error states.`)
} finally {await browser.close();await mf.dispose()}
