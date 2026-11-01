/** Maintainer-only correction. Input and receipts stay outside this public repo. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {validateStoryLabel,labelStatement} from './story-labels.mjs'
import {d1Query} from './business-suite-import.mjs'
const args=process.argv.slice(2),opt=k=>args[args.indexOf(k)+1]
if(!args.includes('--file')||!args.includes('--receipt'))throw Error('Usage: label-story.mjs --file <private label.json> --receipt <new private receipt.json> [--apply]')
if(existsSync(opt('--receipt')))throw Error('Receipt already exists')
const label=validateStoryLabel(JSON.parse(readFileSync(opt('--file'),'utf8'))),at=new Date().toISOString()
if(!args.includes('--apply')){writeFileSync(opt('--receipt'),JSON.stringify({status:'validated_only',media_id:label.media_id,validated_at:at},null,2));console.log('Validated; database unchanged');process.exit(0)}
const binding=readFileSync('scripts/social-publish/worker/wrangler.jsonc','utf8').match(/\{[^{}]*"binding"\s*:\s*"INSIGHTS_DB"[^{}]*\}/)?.[0]
const query=(sql,params)=>d1Query({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:JSON.parse(binding).database_id,token:process.env.CLOUDFLARE_API_TOKEN,sql,params})
const statement=labelStatement(label,at);await query(statement.sql,statement.params)
const rows=await query('SELECT * FROM story_content WHERE media_id=?1',[label.media_id])
if(!rows[0]||Object.entries({...label,labeled_at:at}).some(([k,v])=>rows[0][k]!==v))throw Error('Story label readback failed; confirm the ID belongs to a captured 630 Story')
writeFileSync(opt('--receipt'),JSON.stringify({status:'success',media_id:label.media_id,labeled_at:at,readback:true},null,2)+'\n');console.log('Story label saved and verified')
