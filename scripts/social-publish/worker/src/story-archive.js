/** Private image previews only. No signed CDN URL or Graph token is retained. */
export const MAX_PREVIEW_BYTES = 2_000_000
export function previewURL(story) {
  const value=story.media_type==='VIDEO'?story.thumbnail_url:story.media_url
  if(!value)return null
  const u=new URL(value)
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['.cdninstagram.com','.fbcdn.net'].some(s=>u.hostname.endsWith(s)))throw Error('Unexpected preview host')
  return u.href
}
export async function archiveStoryPreviews({db,bucket,media,account,observedAt,fetchImpl=fetch}) {
  const failures=[]
  for(const story of media) {
    const existing=await db.prepare('SELECT preview_key FROM story_content WHERE media_id=?1').bind(story.id).first()
    if(existing?.preview_key)continue
    let status='unavailable',key=null,hash=null
    try {
      const url=previewURL(story)
      if(url) {
        if(!bucket)throw Error('Story archive binding missing')
        const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000)})
        const type=response.headers.get('content-type')?.split(';')[0].trim()
        if(!response.ok||!['image/jpeg','image/png','image/webp'].includes(type))throw Error('Preview response is not an image')
        if(Number(response.headers.get('content-length'))>MAX_PREVIEW_BYTES)throw Error('Preview exceeds size limit')
        const reader=response.body.getReader(),chunks=[];let size=0
        try { for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PREVIEW_BYTES)throw Error('Preview exceeds size limit');chunks.push(value)} }
        finally {await reader.cancel()}
        if(!size)throw Error('Empty preview')
        const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}
        hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')
        key=`${account}/${story.id}/preview`
        await bucket.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{sha256:hash,media_id:story.id}})
        status='saved'
      }
    } catch {status='failed';failures.push({step:`story preview ${story.id}`,state:'error',detail:'Private preview capture failed; metrics retained'})}
    await db.batch([db.prepare(`INSERT INTO story_content(media_id,preview_key,preview_captured_at,preview_sha256,preview_status)
      VALUES (?1,?2,?3,?4,?5) ON CONFLICT(media_id) DO UPDATE SET preview_key=excluded.preview_key,
      preview_captured_at=excluded.preview_captured_at,preview_sha256=excluded.preview_sha256,preview_status=excluded.preview_status`)
      .bind(story.id,key,key?observedAt:null,hash,status)])
  }
  return failures
}
