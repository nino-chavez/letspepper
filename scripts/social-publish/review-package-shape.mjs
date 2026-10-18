// Worker-safe shape and comparison rules. Filesystem access belongs to review-package.mjs.
import {audioConfiguration} from './reel-audio.mjs'
export const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v)
export const packageBody = pkg => stable(Object.fromEntries(Object.entries(pkg).filter(([k]) => !['digest','approval','state'].includes(k))))
export const isHash = v => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v)
export const same = (a,b) => stable(a) === stable(b)
const isoTime = (v,label) => {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) throw new Error(`${label} must be a valid canonical UTC ISO timestamp`)
  return Date.parse(v)
}
const handles = xs => Array.isArray(xs) && xs.every(x => typeof x === 'string' ? /^[a-z0-9._]{1,30}$/i.test(x) : x && typeof x.username === 'string' && /^[a-z0-9._]{1,30}$/i.test(x.username))
export const captionMentions = caption => [...new Set([...caption.matchAll(/(?<![a-z0-9._])@([a-z0-9._]{1,30})/gi)].map(x => x[1]))]
export function assertPackageShape(pkg, {approved=false, now=new Date()}={}) {
  if (!pkg || pkg.schema !== 'selected-publication/v1') throw new Error('invalid selected-publication package schema')
  if (!['draft','reviewed'].includes(pkg.state) || !pkg.account || !['REELS','IMAGE','STORIES'].includes(pkg.media_type)) throw new Error('package has invalid state, account, or supported media type')
  if (!isHash(pkg.media?.content_sha256) || !isHash(pkg.source?.content_sha256) || !pkg.source?.reference?.trim()) throw new Error('package lacks source/output content hash or source reference')
  if (typeof pkg.caption !== 'string' || !handles(pkg.user_tags) || !handles(pkg.collaborators) || !handles(pkg.mentions) || !same(pkg.mentions,captionMentions(pkg.caption))) throw new Error('package caption or decided mention/tag/collaborator fields are invalid')
  for (const asset of [pkg.cover,pkg.review_media].filter(Boolean)) if (!isHash(asset.content_sha256)) throw new Error('package cover/review media lacks content hash')
  if (pkg.media_type === 'STORIES' && (pkg.caption || pkg.collaborators.length)) throw new Error('reviewed Story cannot carry a caption or collaborators')
  if (pkg.alt_text !== null && typeof pkg.alt_text !== 'string') throw new Error('package must decide image alt text or null')
  if (pkg.media_type !== 'IMAGE' && pkg.alt_text !== null) throw new Error('alt text applies to reviewed images only')
  if (!['none','native','embedded'].includes(pkg.audio?.representation)) throw new Error('package audio representation must be none, native, or embedded')
  if (pkg.audio.representation === 'native') {
    audioConfiguration({media_type:pkg.media_type,audio_configuration:pkg.audio.configuration})
    if (!pkg.audio.configuration) throw new Error('native audio requires its selected configuration')
  } else if (pkg.audio.configuration !== undefined) throw new Error('only native audio may carry catalog configuration')
  if (pkg.source.change === 'audio-only' || pkg.permitted_changes?.includes('audio-only')) {
    if (pkg.source.change !== 'audio-only' || !isHash(pkg.media.video_stream_sha256) || !isHash(pkg.source.original_video_stream_sha256) || pkg.media.video_stream_sha256 !== pkg.source.original_video_stream_sha256 || !same(pkg.media.presentation,pkg.source.original_presentation)) throw new Error('audio-only package does not preserve the selected original video stream and presentation')
  }
  if (pkg.review_media && (!isHash(pkg.media.video_stream_sha256) || pkg.review_media.video_stream_sha256 !== pkg.media.video_stream_sha256 || !same(pkg.review_media.presentation,pkg.media.presentation))) throw new Error('review preview does not preserve the upload picture')
  const d=pkg.delivery || {}
  if (!['review-only','immediate','scheduled'].includes(d.intent)) throw new Error('package has invalid delivery intent')
  if (d.intent === 'scheduled') {
    const start=isoTime(d.scheduled_at,'scheduled_at'), end=isoTime(d.missed_after,'missed_after')
    if (end <= start) throw new Error('scheduled delivery window must end after its start')
    if (typeof d.timezone !== 'string' || (!d.timezone.includes('/') && d.timezone !== 'UTC')) throw new Error('scheduled delivery needs an IANA timezone')
    try { new Intl.DateTimeFormat('en-US',{timeZone:d.timezone}).format(0) } catch { throw new Error('scheduled delivery has an invalid IANA timezone') }
  } else if (d.scheduled_at || d.missed_after || d.timezone) throw new Error('only scheduled packages may carry delivery time or timezone')
  if (approved) {
    if (d.intent === 'review-only') throw new Error('review-only package cannot publish')
    const a=pkg.approval
    if (pkg.state !== 'reviewed' || a?.status !== 'approved' || !a.evidence?.trim() || a.digest !== pkg.digest) throw new Error('package lacks matching human approval evidence')
    const start=isoTime(a.approved_at,'approved_at'), end=isoTime(a.expires_at,'approval expires_at')
    if (end <= start || now.getTime() < start || now.getTime() > end) throw new Error('human approval is not within its explicit validity window')
  }
  return pkg
}
export function assertItemFields(item,pkg,execution,now=new Date(),{publish=false}={}) {
  assertPackageShape(pkg,{approved:true,now})
  if (item.channels?.includes('facebook') || item.facebook_caption || item.facebook_alt_text) throw new Error('reviewed Facebook crosspost is unsupported; bind its destination and copy first')
  if ((item.alt_text ?? null) !== pkg.alt_text) throw new Error('queue alt text differs from reviewed package')
  if (item.ig_container_id && item.review_prepared_digest !== pkg.digest) throw new Error('saved container belongs to another reviewed package; reconcile it before reuse')
  if (item.account !== pkg.account || item.media_type !== pkg.media_type) throw new Error('queue account or media type differs from reviewed package')
  if ((item.caption || '') !== pkg.caption || !same(item.user_tags || [],pkg.user_tags) || !same(item.collaborators || [],pkg.collaborators)) throw new Error('queue caption, tags, or collaborators differ from reviewed package')
  const audio=item.audio_configuration ? {representation:'native',configuration:item.audio_configuration} : {representation:pkg.audio.representation === 'embedded' ? 'embedded' : 'none'}
  if (!same(audio,pkg.audio)) throw new Error('queue audio differs from reviewed package')
  if (pkg.delivery.intent !== execution) throw new Error(`reviewed ${pkg.delivery.intent} delivery cannot execute as ${execution}`)
  if (execution === 'scheduled') {
    if (item.scheduledAt !== pkg.delivery.scheduled_at) throw new Error('queue scheduled time differs from reviewed package')
    if (now.getTime() > Date.parse(pkg.delivery.missed_after)) throw new Error('reviewed scheduled delivery missed its approved window')
    if (publish && now.getTime() < Date.parse(pkg.delivery.scheduled_at)) throw new Error('reviewed scheduled delivery is not due')
  }
  if (item.review_binding?.package_digest !== pkg.digest || item.review_package_digest && item.review_package_digest !== pkg.digest) throw new Error('queue item lacks matching reviewed-package binding')
}
export const hasReviewContract=item=>Boolean(item.review_package || item.review_binding || item.review_package_digest || item.review_media_key || item.review_cover_key || item.review_prepared_digest || item.review_verification_error)
export function selectedPackage(item) {
  if(hasReviewContract(item) && !item.review_package)throw new Error('reviewed item lost its selected-publication package')
  return item.review_package || null
}
export function assertBindingFields(item,execution,now=new Date(),options={}) {
  const pkg=selectedPackage(item)
  if (!pkg) return null
  assertItemFields(item,pkg,execution,now,options)
  const b=item.review_binding
  if (!b?.media || b.media.sha256 !== pkg.media.content_sha256 || typeof b.media.key !== 'string' || !b.media.key.includes(pkg.media.content_sha256)) throw new Error('reviewed media binding is not content-addressed')
  if ((item.video_url || item.image_url) !== b.media.url) throw new Error('queue hosted media URL differs from reviewed content binding')
  if (pkg.cover && (!b.cover || b.cover.sha256 !== pkg.cover.content_sha256 || !b.cover.key?.includes(pkg.cover.content_sha256))) throw new Error('reviewed cover binding is not content-addressed')
  if ((item.cover_url || null) !== (b.cover?.url || null)) throw new Error('queue hosted cover URL differs from reviewed content binding')
  return b
}
