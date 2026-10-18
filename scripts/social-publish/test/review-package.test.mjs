import assert from 'node:assert/strict'
import test, {before, after, mock} from 'node:test'
import {execFileSync,spawnSync} from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertHostedBindingShape, assertItemMatchesPackage, assertLocalFiles, assertWorkerBinding, assertWorkerBindingShape,
  assertLocalHostedBinding, contentHash, createReviewPackage, digestOfPackage, makeHostedBinding, validateReviewPackage,
} from '../review-package.mjs'
import {responseHash} from '../review-package-worker.mjs'
import { seedPayload } from '../seed-kv.mjs'
import worker from '../worker/src/index.js'

// Freeze only Date; transport and subprocess timeouts stay real.
before(() => mock.timers.enable({apis:['Date'],now:new Date('2026-10-18T15:10:00.000Z')}))
after(() => mock.timers.reset())

const dir = () => mkdtempSync(join(tmpdir(), 'review-package-'))
const approved = (pkg, intent = 'immediate') => {
  pkg.state = 'reviewed'; pkg.delivery = intent === 'scheduled'
    ? { intent, scheduled_at: '2026-10-20T14:00:00.000Z', missed_after: '2026-10-20T15:00:00.000Z', timezone: 'America/Chicago' } : { intent }
  pkg.digest = digestOfPackage(pkg); pkg.approval = { status: 'approved', evidence: 'Test fixture only: an explicit approval for this package digest.', approved_at:'2026-10-18T00:00:00.000Z', expires_at:'2026-10-21T00:00:00.000Z', digest: pkg.digest }
  return pkg
}
const itemFor = (pkg, execution = 'immediate') => ({
  id: 'selected-1', account: pkg.account, media_type: pkg.media_type, caption: pkg.caption,
  user_tags: pkg.user_tags, collaborators: pkg.collaborators,
  ...(pkg.audio.representation === 'native' ? { audio_configuration: pkg.audio.configuration } : {}),
  ...(execution === 'scheduled' ? { scheduledAt: pkg.delivery.scheduled_at } : {}),
  review_package: pkg, review_package_digest: pkg.digest, review_binding: { version: 1, package_digest: pkg.digest },
})

test('a generated package is a draft, review-only, and cannot publish merely because a CLI created it', () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'approved-picture')
    const pkg = createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, caption: 'Exact caption', source: { reference: 'TPS selected source v2' } })
    assert.equal(pkg.state, 'draft'); assert.equal(pkg.delivery.intent, 'review-only'); assert.throws(() => validateReviewPackage(pkg, { approved: true }), /review-only/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('accepted local package binds caption, account, tags, audio, cover, source bytes, and delivery', () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); const source = join(root, 'source.mp4'); const cover = join(root, 'cover.jpg')
    writeFileSync(media, 'picture'); writeFileSync(source, 'source-picture'); writeFileSync(cover, 'cover')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, sourceFile: source, coverFile: cover, caption: 'The current selected caption.', userTags: ['team'], collaborators: ['flickday.media'], audio: { representation: 'native', configuration: { audio_id: '123', audio_volume: 60, video_volume: 35 } }, source: { reference: 'TPS master selected 2026-10-18' }, permittedChanges: [] }))
    const item = itemFor(pkg); assert.doesNotThrow(() => { validateReviewPackage(pkg, { approved: true }); assertLocalFiles(pkg); assertItemMatchesPackage(item, pkg, 'immediate') })
    item.video_url = `https://media.invalid/${pkg.media.content_sha256}.mp4`; item.cover_url = `https://media.invalid/${pkg.cover.content_sha256}.jpg`
    item.review_binding = makeHostedBinding(pkg, { mediaUrl: item.video_url, mediaKey: `event/${pkg.media.content_sha256}.mp4`, coverUrl: item.cover_url, coverKey: `event/${pkg.cover.content_sha256}.jpg` })
    assert.doesNotThrow(() => assertHostedBindingShape(item, 'immediate'))
    for (const changed of [
      { account: '630' }, { caption: 'Stale caption' }, { user_tags: [] }, { collaborators: [] },
      { audio_configuration: { audio_id: '999', audio_volume: 60, video_volume: 35 } },
    ]) assert.throws(() => assertItemMatchesPackage({ ...item, ...changed }, pkg, 'immediate'))
    writeFileSync(media, 'wrong-picture'); assert.throws(() => assertLocalFiles(pkg), /media bytes changed/)
    writeFileSync(media, 'picture'); writeFileSync(source, 'wrong-source'); assert.throws(() => assertLocalFiles(pkg), /source bytes changed/)
    writeFileSync(source, 'source-picture'); writeFileSync(cover, 'wrong-cover'); assert.throws(() => assertLocalFiles(pkg), /cover bytes changed/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('audio-only checks actual original/output video streams and preview presentation', () => {
  const root = dir()
  try {
    const original=join(root,'original.mp4'),changed=join(root,'changed.mp4'),samePicture=join(root,'with-audio.mp4')
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=64x96:r=10:d=0.5','-c:v','libx264','-pix_fmt','yuv420p',original])
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x96:r=10:d=0.5','-c:v','libx264','-pix_fmt','yuv420p',changed])
    execFileSync('ffmpeg',['-v','error','-i',original,'-f','lavfi','-i','sine=frequency=500:duration=0.5','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-shortest',samePicture])
    const pkg=createReviewPackage({account:'letspepper',mediaType:'REELS',mediaFile:samePicture,sourceFile:original,reviewFile:samePicture,audio:{representation:'embedded'},source:{reference:original,change:'audio-only'},permittedChanges:['audio-only']})
    assert.doesNotThrow(()=>assertLocalFiles(pkg))
    assert.throws(()=>createReviewPackage({account:'letspepper',mediaType:'REELS',mediaFile:changed,sourceFile:original,source:{reference:original,change:'audio-only'}}),/preserve/)
    pkg.media.video_stream_sha256='a'.repeat(64);pkg.source.original_video_stream_sha256='a'.repeat(64);pkg.digest=digestOfPackage(pkg)
    assert.throws(()=>assertLocalFiles(pkg),/original picture/)
  } finally {rmSync(root,{recursive:true,force:true})}
})

test('scheduled package refuses immediate execution, changed time, and review-only coercion', () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'media')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, source: { reference: 'review frame' } }), 'scheduled')
    const item = itemFor(pkg, 'scheduled'); assert.doesNotThrow(() => assertItemMatchesPackage(item, pkg, 'scheduled'))
    assert.throws(() => assertItemMatchesPackage(item, pkg, 'immediate'), /cannot execute/)
    assert.throws(() => assertItemMatchesPackage({ ...item, scheduledAt: '2026-10-20T15:00:00.000Z' }, pkg, 'scheduled'), /scheduled time/)
    assert.throws(() => assertItemMatchesPackage(item, pkg, 'scheduled', new Date('2026-10-20T16:00:00.000Z')), /missed its approved window/)
    pkg.delivery = { intent: 'review-only' }; pkg.digest = digestOfPackage(pkg); pkg.approval.digest = pkg.digest
    assert.throws(() => assertItemMatchesPackage(item, pkg, 'scheduled'), /review-only/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('worker binding verifies hosted content before a scheduled item can create or retry a container', async () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'hosted-media')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, source: { reference: 'review frame' } }), 'scheduled')
    const item = itemFor(pkg, 'scheduled')
    item.video_url = 'https://media.invalid/' + pkg.media.content_sha256 + '.mp4'
    item.review_binding = makeHostedBinding(pkg, { mediaUrl: item.video_url, mediaKey: `event/${pkg.media.content_sha256}.mp4` })
    item.review_prepared_digest = pkg.digest; item.ig_container_id = 'prepared-container' // a retry still has to re-check bytes.
    assert.doesNotThrow(() => assertWorkerBindingShape(item))
    assert.throws(() => assertHostedBindingShape({ ...item, video_url: 'https://media.invalid/mutable-name.mp4' }, 'scheduled'), /hosted media URL/)
    const routes = { events: { selected: { reason: 'Nino approved this scheduled selected package.', approved: '2026-10-18', accounts: ['letspepper'] } } }
    assert.doesNotThrow(() => seedPayload({ items: [item] }, 'selected', routes))
    assert.throws(() => seedPayload({ items: [{ ...item, caption: 'replacement caption' }] }, 'selected', routes), /caption/)
    await assert.doesNotReject(() => assertWorkerBinding(item, async () => new Response('hosted-media'), new Date('2026-10-20T14:30:00.000Z')))
    await assert.rejects(() => assertWorkerBinding(item, async () => new Response('replaced-bytes'), new Date('2026-10-20T14:30:00.000Z')), /hosted reviewed media bytes/)
    item.review_binding.media.key = 'event/mutable-name.mp4'; assert.throws(() => assertWorkerBindingShape(item), /content-addressed/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the Worker refuses changed hosted bytes before any Graph container request', async () => {
  const root = dir(); const originalFetch = globalThis.fetch
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'reviewed-bytes')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, source: { reference: 'review frame' } }), 'scheduled')
    pkg.delivery.scheduled_at = new Date(Date.now() - 1_000).toISOString(); pkg.delivery.missed_after = new Date(Date.now() + 60_000).toISOString()
    pkg.digest = digestOfPackage(pkg); pkg.approval.digest = pkg.digest
    const item = itemFor(pkg, 'scheduled'); item.status = 'pending'; item.video_url = `https://media.invalid/${pkg.media.content_sha256}.mp4`
    item.review_binding = makeHostedBinding(pkg, { mediaUrl: item.video_url, mediaKey: `event/${pkg.media.content_sha256}.mp4` })
    const values = new Map([['selected', JSON.stringify({ event: 'selected', meta: { route: { reason: 'Nino approved this selected scheduled item.', approved: '2026-10-18', accounts: ['letspepper'] } }, items: [item] })]])
    const kv = { get: async (key) => values.get(key) ?? null, put: async (key, value) => values.set(key, value) }
    let graphCalls = 0
    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://media.invalid/')) return new Response('replaced-bytes')
      graphCalls++; throw new Error('Graph must not be reached')
    }
    const response = await worker.fetch(new Request('https://worker.invalid/run?key=trigger&force=1'), { QUEUE: kv, TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: 'selected', ALLOWED_HOURS_UTC: '0' })
    assert.equal(response.status, 200); assert.equal(graphCalls, 0)
    const saved = JSON.parse(await kv.get('selected')).items[0]
    assert.equal(saved.status, 'error'); assert.match(saved.error, /hosted reviewed media bytes/)
  } finally { globalThis.fetch = originalFetch; rmSync(root, { recursive: true, force: true }) }
})

test('scheduled timestamps, timezone, approval expiry, and early execution are enforced', () => {
  const root=dir()
  try {
    const file=join(root,'media.mp4');writeFileSync(file,'fixture')
    const pkg=approved(createReviewPackage({account:'letspepper',mediaType:'REELS',mediaFile:file,source:{reference:'fixture'}}),'scheduled')
    for(const delta of [
      {scheduled_at:'2026-02-30T14:00:00.000Z'},
      {missed_after:'2026-10-20T13:00:00.000Z'},
      {timezone:'not-a-zone'},
    ]) {const changed=structuredClone(pkg);Object.assign(changed.delivery,delta);changed.digest=digestOfPackage(changed);changed.approval.digest=changed.digest;assert.throws(()=>validateReviewPackage(changed,{approved:true}))}
    const item=itemFor(pkg,'scheduled')
    assert.throws(()=>assertHostedBindingShape({...item,review_binding:{package_digest:pkg.digest}},'scheduled',new Date('2026-10-20T13:00:00.000Z'),{publish:true}),/not due/)
    assert.throws(()=>validateReviewPackage(pkg,{approved:true,now:new Date('2026-10-22T00:00:00.000Z')}),/validity window/)
  } finally {rmSync(root,{recursive:true,force:true})}
})

test('a stripped package or stale prepared container cannot fall back to legacy execution', () => {
  const root=dir()
  try {
    const file=join(root,'media.mp4');writeFileSync(file,'fixture')
    const pkg=approved(createReviewPackage({account:'letspepper',mediaType:'REELS',mediaFile:file,source:{reference:'fixture'}}))
    const item=itemFor(pkg)
    assert.throws(()=>assertHostedBindingShape({...item,review_package:null},'immediate'),/lost its selected-publication/)
    assert.throws(()=>assertItemMatchesPackage({...item,ig_container_id:'old',review_prepared_digest:'old-digest'},pkg,'immediate'),/another reviewed package/)
    assert.doesNotThrow(()=>assertItemMatchesPackage({...item,ig_container_id:'same',review_prepared_digest:pkg.digest},pkg,'immediate'))
    assert.equal(assertHostedBindingShape({id:'legacy'},'immediate'),null)
  } finally {rmSync(root,{recursive:true,force:true})}
})

test('local execution rehashes hosted media and rejects a surprise Facebook destination', async () => {
  const root=dir()
  try {
    const file=join(root,'media.mp4');writeFileSync(file,'fixture')
    const pkg=approved(createReviewPackage({account:'letspepper',mediaType:'REELS',mediaFile:file,source:{reference:'fixture'},audio:{representation:'embedded'}}))
    const item=itemFor(pkg);item.video_url=`https://media.invalid/${pkg.media.content_sha256}.mp4`
    item.review_binding=makeHostedBinding(pkg,{mediaUrl:item.video_url,mediaKey:`${pkg.media.content_sha256}.mp4`})
    await assert.doesNotReject(()=>assertLocalHostedBinding(item,async()=>new Response('fixture')))
    await assert.rejects(()=>assertLocalHostedBinding(item,async()=>new Response('changed')),/media bytes/)
    assert.throws(()=>assertItemMatchesPackage({...item,channels:['instagram','facebook']},pkg,'immediate'),/Facebook/)
  } finally {rmSync(root,{recursive:true,force:true})}
})


test('native catalog metadata is validated and non-streaming fallback is bounded', async () => {
  const root=dir()
  try {
    const file=join(root,'media.mp4');writeFileSync(file,'fixture')
    const options={account:'letspepper',mediaType:'REELS',mediaFile:file,source:{reference:'fixture'}}
    for(const configuration of [undefined,{}, {audio_id:'not-a-number'}, {audio_id:'123',audio_volume:0}]) {
      assert.throws(()=>createReviewPackage({...options,audio:{representation:'native',configuration}}))
    }
    const image={...options,mediaType:'IMAGE',audio:{representation:'native',configuration:{audio_id:'123'}}}
    assert.throws(()=>createReviewPackage(image),/REELS only/)
    if(typeof crypto.DigestStream !== 'function') {
      await assert.rejects(()=>responseHash(new Response(new Uint8Array(1024*1024+1))),/streaming digest unavailable/)
    }
  } finally {rmSync(root,{recursive:true,force:true})}
})


test('the CLI execution-check flag at the end refuses a draft without side effects', () => {
  const root=dir()
  try {
    const media=join(root,'selected.mp4');writeFileSync(media,'fixture')
    const pkg=createReviewPackage({account:'630',mediaType:'REELS',mediaFile:media,source:{reference:'fixture'}})
    const file=join(root,'selected-publication.json');writeFileSync(file,JSON.stringify(pkg))
    const result=spawnSync(process.execPath,[new URL('../review-package.mjs',import.meta.url).pathname,'--validate',file,'--execution-check'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000})
    assert.equal(result.status,3);assert.match(result.stderr,/review-only package cannot publish/)
  } finally {rmSync(root,{recursive:true,force:true})}
})

// A fake KV and transport exercise the scheduler lifecycle without credentials or Meta.
const scheduledFixture = (root, text, id) => {
  const media=join(root,id+'.mp4');writeFileSync(media,text)
  const pkg=approved(createReviewPackage({account:'letspepper',mediaType:'REELS',mediaFile:media,source:{reference:'fixture'}}),'scheduled')
  pkg.delivery.scheduled_at=new Date(Date.now()-1000).toISOString();pkg.delivery.missed_after=new Date(Date.now()+60000).toISOString()
  pkg.digest=digestOfPackage(pkg);pkg.approval.digest=pkg.digest
  const item=itemFor(pkg,'scheduled');Object.assign(item,{id,status:'pending',video_url:`https://media.invalid/${pkg.media.content_sha256}.mp4`})
  item.review_binding=makeHostedBinding(pkg,{mediaUrl:item.video_url,mediaKey:`${pkg.media.content_sha256}.mp4`})
  return item
}
const workerFixture = items => {
  const values=new Map([['selected',JSON.stringify({event:'selected',meta:{route:{reason:'Test fixture route only.',approved:'2026-10-18',accounts:['letspepper']}},items})]])
  const kv={get:async key=>values.get(key)??null,put:async(key,value)=>values.set(key,value)}
  return {kv,env:{QUEUE:kv,TRIGGER_KEY:'trigger',ACTIVE_EVENTS:'selected',ALLOWED_HOURS_UTC:'0',IG_ACCESS_TOKEN:'TEST_ONLY_NOT_A_CREDENTIAL'},items:()=>JSON.parse(values.get('selected')).items}
}
const runWorker=fixture=>worker.fetch(new Request('https://worker.invalid/run?key=trigger&force=1'),fixture.env)
const graphOK=url=>new Response(JSON.stringify(String(url).includes('status_code')?{status_code:'FINISHED'}:{id:String(url).includes('media_publish')?'published':'container'}),{headers:{'Content-Type':'application/json'}})

test('a transient verification failure defers, then retries; only selected media is fetched', async()=>{
  const root=dir(),originalFetch=globalThis.fetch
  try {
    const first=scheduledFixture(root,'first-bytes','first'),second=scheduledFixture(root,'second-bytes','second'),fixture=workerFixture([first,second])
    let graphCalls=0;const mediaCalls=[]
    globalThis.fetch=async url=>{if(String(url).startsWith('https://media.invalid/')){mediaCalls.push(String(url));return new Response('temporary',{status:503})}graphCalls++;return graphOK(url)}
    await runWorker(fixture)
    assert.equal(graphCalls,0);assert.equal(fixture.items()[0].status,'pending');assert.match(fixture.items()[0].review_verification_error,/HTTP 503/);assert.deepEqual(mediaCalls,[first.video_url])
    mediaCalls.length=0
    globalThis.fetch=async url=>{if(String(url).startsWith('https://media.invalid/')){mediaCalls.push(String(url));return new Response('first-bytes')}graphCalls++;return graphOK(url)}
    await runWorker(fixture)
    assert.equal(fixture.items()[0].status,'posted');assert.equal(fixture.items()[1].status,'pending');assert.deepEqual(mediaCalls,[first.video_url]);assert.equal(graphCalls,3)
  } finally {globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
})

test('verification uses the request budget and expiry during transcode stops publication',async()=>{
  const root=dir(),originalFetch=globalThis.fetch
  try {
    const first=scheduledFixture(root,'bytes','first'),fixture=workerFixture([first]);fixture.env.SUBREQUEST_BUDGET='1';let graphCalls=0
    globalThis.fetch=async url=>{if(String(url).startsWith('https://media.invalid/'))return new Response('bytes');graphCalls++;return graphOK(url)}
    await runWorker(fixture);assert.equal(graphCalls,0);assert.equal(fixture.items()[0].status,'pending')
    delete fixture.env.SUBREQUEST_BUDGET
    globalThis.fetch=async url=>{
      if(String(url).startsWith('https://media.invalid/'))return new Response('bytes')
      graphCalls++
      if(String(url).includes('status_code'))mock.timers.setTime(new Date('2026-10-18T15:12:00.000Z').getTime())
      return graphOK(url)
    }
    await runWorker(fixture);assert.equal(graphCalls,2);assert.equal(fixture.items()[0].status,'error');assert.match(fixture.items()[0].error,/missed its approved window/);assert.equal(fixture.items()[0].ig_container_id,'container')
  } finally {mock.timers.setTime(new Date('2026-10-18T15:10:00.000Z').getTime());globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
})

test('prepared, cover and verification review markers cannot be stripped into legacy',()=>{
  for(const marker of ['review_prepared_digest','review_cover_key','review_verification_error']) {
    assert.throws(()=>assertHostedBindingShape({id:'stripped',[marker]:'saved'},'immediate'),/lost its selected-publication/)
  }
})
