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
    for (;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024)throw new Error('streaming digest unavailable for media over 1 MiB');chunks.push(value)}
  } finally {await reader.cancel().catch(()=>{})}
  const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength}
  return hex(await crypto.subtle.digest('SHA-256',data))
}
export async function assertWorkerBinding(item,fetchImpl=fetch,now=new Date(),hashResponse=responseHash) {
  if (!selectedPackage(item)) return true
  if (item.review_package.digest !== await webPackageDigest(item.review_package)) throw new Error('package digest does not match selected publication')
  const binding=assertBindingFields(item,'scheduled',now,{publish:true})
  await assertBytes(binding,fetchImpl,hashResponse)
  return true
}
export async function assertBytes(binding,fetchImpl,hashResponse) {
  for (const [kind,asset] of Object.entries(binding).filter(([kind])=>['media','cover'].includes(kind))) {
    const response=await fetchImpl(asset.url,{cache:'no-store',signal:AbortSignal.timeout(120000)})
    if (await hashResponse(response) !== asset.sha256) throw new Error(`hosted reviewed ${kind} bytes differ from approved content hash`)
  }
}
