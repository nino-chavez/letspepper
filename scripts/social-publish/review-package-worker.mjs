// No Node imports: this module is bundled into the existing Worker without nodejs_compat.
import {packageBody,assertBindingFields,selectedPackage} from './review-package-shape.mjs'
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('')
export async function webPackageDigest(pkg) {return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packageBody(pkg)))).slice(0,32)}
export async function responseHash(response) {
  if (!response.ok || !response.body) throw new Error(`hosted reviewed media unavailable (${response.status})`)
  // Cloudflare's streaming digest does not buffer the video in the isolate.
  // https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#constructors
  if (typeof crypto.DigestStream === 'function') {
    const stream=new crypto.DigestStream('SHA-256')
    await response.body.pipeTo(stream)
    return hex(await stream.digest)
  }
  // Bounded fallback for tiny test responses. Production videos require a streaming hasher.
  const reader=response.body.getReader();const chunks=[];let bytes=0
  try {
    for (;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024)throw Object.assign(new Error('streaming digest unavailable for media over 1 MiB'),{code:'REVIEW_MEDIA_UNSUPPORTED'});chunks.push(value)}
  } finally {await reader.cancel().catch(()=>{})}
  const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength}
  return hex(await crypto.subtle.digest('SHA-256',data))
}
export async function assertWorkerBindingFields(item,now=new Date()) {
  if (!selectedPackage(item)) return null
  if (item.review_package.digest !== await webPackageDigest(item.review_package)) throw new Error('package digest does not match selected publication')
  return assertBindingFields(item,'scheduled',now,{publish:true})
}
export async function assertWorkerBinding(item,fetchImpl=fetch,now=new Date(),hashResponse=responseHash) {
  const binding=await assertWorkerBindingFields(item,now)
  if (!binding) return true
  await assertBytes(binding,fetchImpl,hashResponse)
  return true
}
export const mediaVerificationUnavailable=error=>error?.code==='REVIEW_MEDIA_UNAVAILABLE'
const unavailable=error=>Object.assign(new Error(`reviewed media verification unavailable: ${error.message || error}`),{code:'REVIEW_MEDIA_UNAVAILABLE'})
export async function assertBytes(binding,fetchImpl,hashResponse) {
  for (const [kind,asset] of Object.entries(binding).filter(([kind])=>['media','cover'].includes(kind))) {
    let actual
    try {
      const response=await fetchImpl(asset.url,{cache:'no-store',signal:AbortSignal.timeout(120000)})
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      actual=await hashResponse(response)
    } catch(error) {
      if(error.code==='REVIEW_MEDIA_UNSUPPORTED')throw error
      throw unavailable(error)
    }
    if (actual !== asset.sha256) throw new Error(`hosted reviewed ${kind} bytes differ from approved content hash`)
  }
}
