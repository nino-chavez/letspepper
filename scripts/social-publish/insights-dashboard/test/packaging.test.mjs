import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { seeded, PASSPHRASE } from './fixtures.mjs'
import { sessionCookie } from '../src/auth.js'
const require=createRequire(import.meta.url)

test('the exact Wrangler bundle runs its serialized browser script without Worker-scope helpers',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'insights-package-'))
  const config=resolve('scripts/social-publish/insights-dashboard/wrangler.jsonc')
  const cookie=(await sessionCookie(PASSPHRASE)).split(';')[0]
  async function packagedScript(configPath,name){
    const output=join(dir,name)
    execFileSync(process.execPath,[require.resolve('wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',configPath,'--outdir',output],{stdio:'pipe',timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}})
    const {default:worker}=await import(pathToFileURL(join(output,'index.js')))
    const response=await worker.fetch(new Request('https://dashboard.test/',{headers:{cookie}}),{INSIGHTS_DB:seeded(),DASHBOARD_PASSPHRASE:PASSPHRASE})
    assert.equal(response.status,200)
    return (await response.text()).match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]
  }
  function run(script){
    const elements=new Map()
    const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',addEventListener(){}});return elements.get(selector)},addEventListener(){}}
    runInNewContext(script,{document,window:{addEventListener(){}},location:'https://dashboard.test/',history:{replaceState(){}},URL,URLSearchParams},{timeout:2000})
    assert.match(elements.get('#main').innerHTML,/Start with a question/)
    return elements
  }
  try {
    // Negative control reproduces the deployed failure, proving this test can detect it.
    const broken=readFileSync(config,'utf8').replace('"keep_names": false','"keep_names": true').replace('"main": "src/index.js"',`"main": ${JSON.stringify(resolve('scripts/social-publish/insights-dashboard/src/index.js'))}`)
    const brokenConfig=join(dir,'broken.jsonc');writeFileSync(brokenConfig,broken)
    const brokenScript=await packagedScript(brokenConfig,'negative')
    assert.throws(()=>run(brokenScript),/__name is not defined/)
    const good=await packagedScript(config,'production')
    run(good)
  } finally {rmSync(dir,{recursive:true,force:true})}
})
