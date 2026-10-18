/** Local selected-publication package builder. It never creates approval or a platform item. */
import {readFileSync,openSync,readSync,closeSync,fstatSync,writeFileSync,renameSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {basename,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {audioFromArgs} from './reel-audio.mjs'
import {packageBody,assertPackageShape,assertItemFields,assertBindingFields,same,captionMentions,hasReviewContract,selectedPackage} from './review-package-shape.mjs'
import {assertBytes,assertWorkerBinding} from './review-package-worker.mjs'
export {assertWorkerBinding,hasReviewContract}
const sha256=value=>createHash('sha256').update(value).digest('hex')
export const digestOfPackage=pkg=>sha256(packageBody(pkg)).slice(0,32)
export function contentHash(file) {
  const fd=openSync(file,'r');const hash=createHash('sha256');const buffer=Buffer.allocUnsafe(4*1024*1024)
  try {const before=fstatSync(fd);let n;while((n=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));const after=fstatSync(fd);if(before.size!==after.size || before.mtimeMs!==after.mtimeMs)throw new Error('media changed during hashing');return hash.digest('hex')} finally {closeSync(fd)}
}
export function videoFingerprint(file) {
  const output=execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-'],{encoding:'utf8',timeout:120000}).trim()
  const video_stream_sha256=output.replace(/^SHA256=/,'').toLowerCase()
  const data=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',file],{encoding:'utf8',timeout:30000}))
  const v=data.streams?.[0];if(!v)throw new Error('selected video has no picture stream')
  const presentation=Object.fromEntries(['codec_name','width','height','pix_fmt','sample_aspect_ratio','display_aspect_ratio','r_frame_rate','avg_frame_rate','duration','nb_frames','color_space','color_transfer','color_primaries'].filter(k=>v[k]!==undefined).map(k=>[k,v[k]]))
  presentation.rotation=v.side_data_list?.find(x=>x.rotation!==undefined)?.rotation ?? Number(v.tags?.rotate || 0)
  return {video_stream_sha256,presentation}
}
export function createReviewPackage({account,mediaType,mediaFile,sourceFile=null,reviewFile=null,caption='',altText=null,coverFile=null,userTags=[],collaborators=[],audio={representation:'none'},source={},permittedChanges=[]}) {
  if(!account || !mediaType || !mediaFile || !source.reference?.trim())throw new Error('account, mediaType, mediaFile and reviewed source reference are required')
  const media=resolve(mediaFile),original=resolve(sourceFile || media)
  const pkg={schema:'selected-publication/v1',state:'draft',account,media_type:mediaType,destinations:['instagram'],
    media:{file:media,filename:basename(media),content_sha256:contentHash(media)},
    cover:coverFile?{file:resolve(coverFile),filename:basename(coverFile),content_sha256:contentHash(resolve(coverFile))}:null,
    caption,alt_text:altText,mentions:captionMentions(caption),user_tags:[...userTags],collaborators:[...collaborators],audio,
    delivery:{intent:'review-only'},source:{...source,file:original,content_sha256:contentHash(original)},permitted_changes:[...permittedChanges]}
  if(source.change==='audio-only' || permittedChanges.includes('audio-only')) {
    if(!sourceFile)throw new Error('audio-only requires the explicitly selected original sourceFile')
    const a=videoFingerprint(original),b=videoFingerprint(media)
    pkg.source.original_video_stream_sha256=a.video_stream_sha256;pkg.source.original_presentation=a.presentation;Object.assign(pkg.media,b)
  }
  if(reviewFile) {
    const file=resolve(reviewFile);Object.assign(pkg.media,videoFingerprint(media))
    pkg.review_media={file,filename:basename(file),content_sha256:contentHash(file),...videoFingerprint(file)}
  }
  pkg.digest=digestOfPackage(pkg);validateReviewPackage(pkg);return pkg
}
export function validateReviewPackage(pkg,{approved=false,now=new Date()}={}) {
  assertPackageShape(pkg,{approved,now})
  if(pkg.digest!==digestOfPackage(pkg))throw new Error('package digest does not match selected publication')
  return pkg
}
export function assertLocalFiles(pkg) {
  for(const [name,asset] of Object.entries({media:pkg.media,source:pkg.source,cover:pkg.cover,review:pkg.review_media})) {
    if(asset?.file && contentHash(asset.file)!==asset.content_sha256)throw new Error(`selected ${name} bytes changed after review`)
  }
  if(pkg.source.change==='audio-only') {
    const original=videoFingerprint(pkg.source.file),output=videoFingerprint(pkg.media.file)
    if(original.video_stream_sha256!==pkg.source.original_video_stream_sha256 || output.video_stream_sha256!==pkg.media.video_stream_sha256 || !same(original.presentation,pkg.source.original_presentation) || !same(output.presentation,pkg.media.presentation) || !same(original,output))throw new Error('audio-only selected original picture or presentation differs')
  }
  if(pkg.review_media) {
    const review=videoFingerprint(pkg.review_media.file),output=videoFingerprint(pkg.media.file)
    if(!same(review,output) || !same(output,{video_stream_sha256:pkg.media.video_stream_sha256,presentation:pkg.media.presentation}))throw new Error('review preview differs from upload picture')
  }
  return true
}
export function assertItemMatchesPackage(item,pkg,execution,now=new Date(),options={}) {
  validateReviewPackage(pkg,{approved:true,now});assertItemFields(item,pkg,execution,now,options);return true
}
export function assertLocalItemFiles(item) {
  const pkg=selectedPackage(item);if(!pkg)return true
  assertLocalFiles(pkg)
  if(!item.file || contentHash(item.file)!==pkg.media.content_sha256)throw new Error('queue media file differs from reviewed content')
  if(Boolean(item.cover_file)!==Boolean(pkg.cover) || item.cover_file && contentHash(item.cover_file)!==pkg.cover.content_sha256)throw new Error('queue cover file differs from reviewed content')
  return true
}
export function makeHostedBinding(pkg,{mediaUrl,mediaKey,coverUrl=null,coverKey=null}) {
  if(!mediaUrl || !mediaKey)throw new Error('hosted media URL and content-addressed key are required')
  if(pkg.cover && (!coverUrl || !coverKey))throw new Error('hosted cover URL and content-addressed key are required')
  return {version:1,package_digest:pkg.digest,media:{url:mediaUrl,key:mediaKey,sha256:pkg.media.content_sha256},...(pkg.cover?{cover:{url:coverUrl,key:coverKey,sha256:pkg.cover.content_sha256}}:{})}
}
export function assertHostedBindingShape(item,execution,now=new Date(),options={}) {
  if(!selectedPackage(item))return null
  validateReviewPackage(item.review_package,{approved:true,now});return assertBindingFields(item,execution,now,options)
}
export const assertWorkerBindingShape=(item,now=new Date())=>assertHostedBindingShape(item,'scheduled',now)
const nodeResponseHash=async response=>{if(!response.ok || !response.body)throw new Error(`hosted reviewed media unavailable (${response.status})`);const hash=createHash('sha256');for await(const chunk of response.body)hash.update(chunk);return hash.digest('hex')}
export async function assertLocalHostedBinding(item,fetchImpl=fetch,now=new Date()) {
  const binding=assertHostedBindingShape(item,item.review_package?.delivery.intent,now,{publish:true});if(!binding)return true
  await assertBytes(binding,fetchImpl,nodeResponseHash);return true
}
const argsOf=argv=>Object.fromEntries(argv.flatMap((v,i,all)=>v.startsWith('--')?[[v.slice(2),all[i+1] === undefined || all[i+1].startsWith('--') ? true : all[i+1]]]:[]))
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {
    const args=argsOf(process.argv.slice(2))
    if(args.create && args.account && args['media-type'] && args.media && args.out) {
      if(existsSync(args.out) && JSON.parse(readFileSync(args.out,'utf8')).approval?.status==='approved')throw new Error('refusing to overwrite an approved package; create a new version')
      const configuration=audioFromArgs(args,args['media-type'])
      const audio=configuration?{representation:'native',configuration}:{representation:args['audio-representation'] || 'none'}
      const pkg=createReviewPackage({account:args.account,mediaType:args['media-type'],mediaFile:args.media,sourceFile:args['source-file'],reviewFile:args['review-media'],caption:args['caption-file']?readFileSync(args['caption-file'],'utf8'):'',altText:args['alt-text'] || null,coverFile:args.cover,userTags:typeof args.tags==='string'?args.tags.split(',').filter(Boolean):[],collaborators:typeof args.collaborators==='string'?args.collaborators.split(',').filter(Boolean):[],source:{reference:args.source,change:args['change-scope'] || 'full-edit'},audio})
      const temporary=`${args.out}.${process.pid}.tmp`;writeFileSync(temporary,`${JSON.stringify(pkg,null,2)}\n`);renameSync(temporary,args.out);console.log(`Draft review-only package ${pkg.digest} → ${args.out}`)
    } else if(args.validate) {
      const pkg=JSON.parse(readFileSync(args.validate,'utf8'));validateReviewPackage(pkg,{approved:Boolean(args['execution-check'])});assertLocalFiles(pkg);console.log(JSON.stringify({valid:true,state:pkg.state,intent:pkg.delivery.intent,digest:pkg.digest,publishable:pkg.state==='reviewed' && pkg.approval?.status==='approved' && pkg.delivery.intent!=='review-only'}))
    } else throw new Error('Usage: review-package.mjs --create --account slug --media-type REELS --media file --source reference --out package.json [--review-media file] | --validate package.json [--execution-check]')
  } catch(error) {console.error(`REFUSED — ${error.message}`);process.exitCode=3}
}
