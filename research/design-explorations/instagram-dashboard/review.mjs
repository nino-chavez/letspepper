// Local design-study verification, not production acceptance.
// Run with the repository's Playwright dependency and the study preview serving on :8765.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out=path.join(root,'docs/evidence/screen-reviews/instagram-study-20261016');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1365,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const records=[];
const base=process.env.STUDY_URL||'http://127.0.0.1:8765/';
async function capture(name,query){
 await page.goto(base+'?'+new URLSearchParams(query));
 await page.locator('h1').waitFor();
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>document.documentElement.clientWidth),false,`Overflow: ${name}`);
 await page.screenshot({path:path.join(out,name+'.jpg'),type:'jpeg',quality:85,fullPage:true});
 records.push({file:name+'.jpg',...query,viewport:page.viewportSize()});
}
try {
 // Prove the overflow check detects an actual defect before using it.
 await page.goto(base);
 await page.evaluate(()=>{const x=document.createElement('div');x.id='overflow-probe';x.style='width:3000px;height:1px';document.body.append(x);});
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>document.documentElement.clientWidth),true,'Overflow canary did not fail');
 await page.locator('#overflow-probe').evaluate(e=>e.remove());
 for(const concept of ['a','b','c'])for(const state of ['complete','missing','stale','empty'])await capture(`${concept}-${state}`,{concept,state,page:'overview'});
 for(const name of ['posts','stories','audience','status'])await capture('a-'+name,{concept:'a',state:'complete',page:name});

 await page.goto(base+'?concept=a&state=missing');
 assert.equal(await page.locator('.chart-line').getAttribute('d').then(d=>(d.match(/M/g)||[]).length),2,'A missing day must break the line');
 assert.equal(await page.locator('.finding').innerText().then(t=>t.includes('50%')),false,'Missing days must suppress comparison');
 assert.equal(await page.locator('.side-section').innerText().then(t=>t.includes('12 net')),false,'Missing unfollows must suppress complete net');

 await page.goto(base+'?concept=a');
 await page.getByRole('button',{name:'Compare posts by saves',exact:true}).click();
 assert.equal(await page.locator('#sort').inputValue(),'saves');
 const first=page.locator('.post-link').first();
 assert.match(await first.innerText(),/repeatable serve/);
 await first.click();
 assert.equal(await page.locator('#post-detail').evaluate(e=>e.open),true);
 await page.screenshot({path:path.join(out,'a-post-detail.jpg'),type:'jpeg',quality:85});
 records.push({file:'a-post-detail.jpg',page:'post-detail',viewport:page.viewportSize()});
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#post-detail').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#sort').inputValue(),'saves');
 await page.getByRole('button',{name:'Help with this page',exact:true}).click();
 assert.match(await page.locator('#help-title').innerText(),/Learn from a post/);
 await page.screenshot({path:path.join(out,'a-help.jpg'),type:'jpeg',quality:85});
 records.push({file:'a-help.jpg',page:'posts',topic:'posts',viewport:page.viewportSize()});
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Help with this page','Help must return focus');
 await page.getByPlaceholder('Search caption').fill('no matching post');
 assert.equal(await page.getByRole('heading',{name:'No posts match these filters.'}).count(),1);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 assert.equal(await page.locator('.post-link').count(),5);

 await page.setViewportSize({width:390,height:844});
 for(const name of ['overview','posts','stories','audience','status'])await capture('phone-'+name,{concept:'a',state:'complete',page:name});
 await page.getByRole('button',{name:'Help with this page',exact:true}).click();
 await page.screenshot({path:path.join(out,'phone-help.jpg'),type:'jpeg',quality:85});
 records.push({file:'phone-help.jpg',page:'status',topic:'freshness',viewport:page.viewportSize()});
 assert.equal(await page.locator('#help').evaluate(e=>e.getBoundingClientRect().width<=document.documentElement.clientWidth),true);

 // Selected blend: stable page navigation, question-specific answers and actions.
 await page.setViewportSize({width:1365,height:900});
 await page.goto(base);
 assert.equal(await page.locator('body').getAttribute('class'),'concept-d');
 for(const state of ['complete','missing','stale','empty'])await capture(`blend-${state}`,{concept:'d',state,page:'overview'});
 for(const question of ['posts','followers'])await capture(`blend-${question}`,{concept:'d',state:'complete',page:'overview',question});
 for(const name of ['posts','stories','audience','status'])await capture('blend-page-'+name,{concept:'d',state:'complete',page:name});
 await page.goto(base);
 await page.getByRole('button',{name:'What should we learn from? Find content worth a closer look.',exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get('question'),'posts');
 assert.match(await page.locator('th[aria-sort]').innerText(),/Lifetime saves/);
 assert.match(await page.locator('.post-link').first().innerText(),/repeatable serve/);
 assert.equal(await page.locator('tbody tr').first().locator('td').nth(2).innerText(),'28');
 await page.reload();
 assert.equal(await page.locator('[data-question="posts"]').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Compare all posts by saves',exact:true}).click();
 assert.equal(await page.locator('#sort').inputValue(),'saves');
 await page.getByPlaceholder('Search caption').fill('nothing matches');
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Overview',exact:true}).click();
 assert.equal(await page.locator('.post-link').count(),3,'Overview must not inherit hidden post filters');
 await page.getByRole('button',{name:'Compare all posts by saves',exact:true}).click();
 assert.equal(await page.locator('.post-link').count(),5,'Compare all must clear earlier filters');
 await page.getByRole('button',{name:'Help with this page',exact:true}).click();
 await page.screenshot({path:path.join(out,'blend-help.jpg'),type:'jpeg',quality:85});
 records.push({file:'blend-help.jpg',concept:'d',page:'posts',topic:'posts',viewport:page.viewportSize()});
 await page.keyboard.press('Escape');
 await page.goto(base+'?concept=d&state=empty');
 assert.equal(await page.locator('.period-line').innerText().then(t=>t.includes('Last read')),false,'Empty state cannot claim a last reading');
 await page.goto(base+'?concept=d&state=missing&question=followers');
 assert.equal(await page.locator('.finding').innerText().then(t=>t.includes('12 more')),false);
 await page.setViewportSize({width:390,height:844});
 for(const question of ['reach','posts','followers'])await capture('blend-phone-'+question,{concept:'d',state:'complete',page:'overview',question});
 for(const name of ['posts','stories','audience','status'])await capture('blend-phone-'+name+'-page',{concept:'d',state:'complete',page:name});
 await page.goto(base);
 await page.getByRole('button',{name:'Study controls',exact:true}).click();
 assert.equal(await page.locator('#concept').isVisible(),true);
 await page.getByRole('button',{name:'Study controls',exact:true}).click();
 assert.equal(await page.locator('#concept').isVisible(),false);
 assert.equal(await page.getByText('Mock — synthetic data',{exact:true}).isVisible(),true);
 await page.getByLabel('Your question',{exact:true}).selectOption('posts');
 assert.equal(await page.locator('.post-link').count(),3);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'question-picker');
 await page.getByRole('button',{name:'Help with this page',exact:true}).click();
 await page.screenshot({path:path.join(out,'blend-phone-help.jpg'),type:'jpeg',quality:85});
 assert.match(await page.locator('#help-title').innerText(),/Learn from a post/);
 records.push({file:'blend-phone-help.jpg',concept:'d',page:'overview',topic:'posts',viewport:page.viewportSize()});
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'captures.json'),JSON.stringify({kind:'design-study',synthetic:true,records},null,2)+'\n');
 console.log(`PASS: ${records.length} synthetic captures; missing-data semantics, sorting, post detail, filtering, help focus, phone overflow; blended question navigation, state restoration, scoped sorting and actions; overflow canary detected.`);
} finally {await browser.close();}
