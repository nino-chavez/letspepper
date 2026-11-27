/**
 * Facebook Page destination for a release-bound queue item — the Page half of post-reels.mjs.
 *
 * Only an item queued from a reviewed release.json reaches this file (release-contract.mjs binds
 * its `channels`, `facebook_caption`, `facebook_title` and `facebook_alt_text`). A Worker campaign
 * item keeps the Worker's own Page path (worker/src/index.js publishFacebookItem). The Reel steps
 * mirror that Worker code — start, hosted upload, finish — with two differences that matter for a
 * one-off: a saved video's status is read before anything is sent again, and a draft is possible.
 *
 * Reels: Meta's Reels Publishing API (developers.facebook.com/docs/video-api/guides/reels-publishing,
 * read 2026-11-27): POST /{page-id}/video_reels upload_phase=start returns video_id and upload_url;
 * POST upload_url with `Authorization: OAuth <Page token>` and `file_url: <hosted video>`; then
 * upload_phase=finish with video_state PUBLISHED (or DRAFT) and the description. Status is
 * GET /{video-id}?fields=status. Page token from a user with the CREATE_CONTENT task, scopes
 * pages_show_list, pages_read_engagement, pages_manage_posts. 3–90 s, 9:16, 30 API Reels per Page
 * per 24 h. The Reels API takes no cover; Meta picks the frame.
 *
 * Photos: POST /{page-id}/photos url, message, published=true, alt_text_custom — the Worker's call.
 *
 * Double posts. A Reel is one video object: once its id is saved, every later run reads that
 * video's status first and never starts a second one, so a lost response cannot become two Reels.
 * A photo has no such object: once a publish was sent and its answer lost, the item is held until
 * someone looks at the Page. A definite refusal from Graph (a 4xx with a non-transient code) is
 * not a post, and the item may be run again.
 *
 * Pure: the Graph call, the upload, the clock and the persist step are passed in.
 */

export const REEL_POLL = { attempts: 60, intervalMs: 5000 }
const TRANSIENT_CODES = [1, 2, 4, 17, 32, 613]

/** The Page token: exchanged from the stored credential when Graph offers one, else the credential itself. */
export async function pageToken({ api, token, pageId }) {
  try {
    const r = await api(pageId, { fields: 'access_token' }, 'GET', token)
    if (typeof r?.access_token === 'string' && r.access_token) return r.access_token
  } catch { /* a Page token stored directly may not offer the field; use it as it is */ }
  return token
}

/** The parts of GET /{video-id}?fields=status this publisher decides on. */
export function reelState(status) {
  const phase = (p) => status?.[p]?.status ?? null
  const failed = status?.video_status === 'error' || status?.video_status === 'upload_failed' || status?.video_status === 'expired' ||
    phase('uploading_phase') === 'error' || phase('processing_phase') === 'error' || phase('publishing_phase') === 'error' ||
    status?.publishing_phase?.publish_status === 'error'
  const message = status?.processing_phase?.error?.message || status?.publishing_phase?.error?.message ||
    (status?.uploading_phase?.errors?.length ? JSON.stringify(status.uploading_phase.errors) : null) || status?.video_status || 'error'
  return {
    video: status?.video_status ?? null,
    uploaded: ['complete', 'completed'].includes(phase('uploading_phase')),
    processed: ['complete', 'completed'].includes(phase('processing_phase')) || status?.video_status === 'ready',
    publish: status?.publishing_phase?.publish_status ?? null,
    error: failed ? message : null,
  }
}
const describeState = (s) => `video ${s.video ?? '?'}, publish ${s.publish ?? '?'}`

export const reelPermalink = (videoId) => `https://www.facebook.com/reel/${videoId}`
export const postPermalink = (postId) => `https://www.facebook.com/${postId}`

/**
 * Publish (or, with draft, save as a draft) one Page Reel. Returns { ok, held?, message }. Item
 * fields written: facebook_status (building → posted | draft | error), facebook_video_id,
 * facebook_upload_url, facebook_uploaded, facebook_finish_sent_at, facebook_post_id,
 * facebook_posted_at, facebook_permalink, facebook_error.
 */
export async function publishPageReel({ api, upload, sleep, token, pageId, item, save, draft = false, poll = REEL_POLL, now = () => new Date() }) {
  const want = draft ? 'draft' : 'published'
  const done = (s) => (draft ? s.publish === 'draft' && s.processed : s.publish === 'published')
  const settle = () => {
    item.facebook_status = draft ? 'draft' : 'posted'
    item.facebook_post_id = item.facebook_video_id
    item.facebook_posted_at = now().toISOString()
    item.facebook_permalink = reelPermalink(item.facebook_video_id)
    item.facebook_error = null
    save()
    return { ok: true, message: `${draft ? 'saved as a Page draft' : 'posted to the Page'} (video ${item.facebook_video_id}) ${item.facebook_permalink}` }
  }
  const fail = (message) => { item.facebook_status = 'error'; item.facebook_error = message; save(); return { ok: false, message } }

  // A saved video: its status decides, before anything is sent again.
  if (item.facebook_video_id) {
    let s
    try { s = reelState((await api(item.facebook_video_id, { fields: 'status' }, 'GET', token)).status) } catch (e) {
      item.facebook_error = `could not read the status of saved Facebook video ${item.facebook_video_id} (${e.message}) — not uploading or finishing it again; run again`
      save()
      return { ok: false, held: true, message: item.facebook_error }
    }
    if (done(s)) return settle()
    if (s.error) return fail(`saved Facebook video ${item.facebook_video_id} failed at Meta: ${s.error}`)
    if (s.uploaded) item.facebook_uploaded = true
    if (item.facebook_finish_sent_at) {
      // The finish went out before and its answer was lost. Same video: wait for it, never a second one.
      return waitFor({ api, sleep, token, item, poll, done, settle, fail, want })
    }
  }

  if (!item.facebook_video_id) {
    const start = await api(`${pageId}/video_reels`, { upload_phase: 'start' }, 'POST', token)
    if (!start?.video_id || !start?.upload_url) return fail(`Facebook Reel start returned no video_id/upload_url: ${JSON.stringify(start)}`)
    item.facebook_video_id = start.video_id
    item.facebook_upload_url = start.upload_url
    item.facebook_status = 'building'
    save()
  }

  if (!item.facebook_uploaded) {
    // upload_url is what start returned: never a URL built here, so a stub or a new rupload host is honored.
    const res = await upload(item.facebook_upload_url, { Authorization: `OAuth ${token}`, file_url: item.video_url })
    if (res?.success !== true) return fail(`Facebook Reel upload was not accepted: ${JSON.stringify(res)}`)
    item.facebook_uploaded = true
    save()
  }

  item.facebook_finish_sent_at = now().toISOString()
  save()
  let finish
  try {
    finish = await api(`${pageId}/video_reels`, {
      upload_phase: 'finish',
      video_id: item.facebook_video_id,
      video_state: draft ? 'DRAFT' : 'PUBLISHED',
      description: item.facebook_caption ?? '',
      ...(item.facebook_title ? { title: item.facebook_title } : {}),
    }, 'POST', token)
  } catch (e) {
    // A definite refusal (say, a missing pages_manage_posts) means the finish did not land: clear the
    // mark so a run after the fix finishes this same video, instead of waiting on it forever.
    if (definiteRefusal(e)) { delete item.facebook_finish_sent_at; save() }
    throw e
  }
  if (finish?.success !== true) return fail(`Facebook Reel finish was not accepted: ${JSON.stringify(finish)}`)
  return waitFor({ api, sleep, token, item, poll, done, settle, fail, want })
}

async function waitFor({ api, sleep, token, item, poll, done, settle, fail, want }) {
  let last = null
  for (let i = 0; i < poll.attempts; i++) {
    if (i) await sleep(poll.intervalMs)
    try { last = reelState((await api(item.facebook_video_id, { fields: 'status' }, 'GET', token)).status) } catch { continue }
    if (done(last)) return settle()
    if (last.error) return fail(`Facebook video ${item.facebook_video_id} failed at Meta: ${last.error}`)
  }
  return fail(`finish was sent at ${item.facebook_finish_sent_at}, but video ${item.facebook_video_id} is not ${want} after ${Math.round((poll.attempts * poll.intervalMs) / 60_000)} min (${last ? describeState(last) : 'status unreadable'}). ` +
    'Check the Page. A re-run reads this video\'s status first and never uploads it again.')
}

/** A Graph refusal that says nothing was created: a 4xx whose code is not a throttle or a retry-later. */
export const definiteRefusal = (e) => Number.isInteger(e?.http) && e.http >= 400 && e.http < 500 && !TRANSIENT_CODES.includes(e?.code)

/** Publish one Page photo. Returns { ok, held?, message }. */
export async function publishPagePhoto({ api, token, pageId, item, save, now = () => new Date() }) {
  if (item.facebook_status === 'building' && item.facebook_attempted_at && !item.facebook_post_id) {
    const message = `a Page photo publish was sent at ${item.facebook_attempted_at} and its outcome is unknown — check the Page before anything else. ` +
      'If it is there, record it in the receipt and leave this item; if not, publish from the reviewed package again (a new item). A photo post cannot be retried safely.'
    return { ok: false, held: true, message }
  }
  item.facebook_status = 'building'
  item.facebook_attempted_at = now().toISOString()
  save()
  let r
  try {
    r = await api(`${pageId}/photos`, {
      url: item.image_url,
      message: item.facebook_caption ?? '',
      published: 'true',
      ...(item.facebook_alt_text ? { alt_text_custom: item.facebook_alt_text } : {}),
    }, 'POST', token)
  } catch (e) {
    if (definiteRefusal(e)) {
      item.facebook_status = 'error'; item.facebook_error = e.message; delete item.facebook_attempted_at; save()
      return { ok: false, message: e.message }
    }
    item.facebook_error = `outcome unknown (${e.message}) — check the Page before running again`
    save()
    return { ok: false, held: true, message: item.facebook_error }
  }
  item.facebook_status = 'posted'
  item.facebook_post_id = r?.post_id || r?.id
  item.facebook_posted_at = now().toISOString()
  item.facebook_permalink = postPermalink(item.facebook_post_id)
  item.facebook_error = null
  save()
  return { ok: true, message: `posted to the Page (post ${item.facebook_post_id}) ${item.facebook_permalink}` }
}
