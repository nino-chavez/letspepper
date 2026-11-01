import {test} from 'node:test'
import assert from 'node:assert/strict'
import {capturePostSnapshot} from '../business-suite-post-capture.mjs'
test('waits for a delayed second page beyond the former five-second window',async()=>{
 let reads=0,scrolls=0
 const result=await capturePostSnapshot({read:()=>({rows:++reads<15?10:20}),validate:c=>{if(c.rows<12)throw Error('twelve required')},scroll:()=>scrolls++,wait:async()=>{},saveFailure:()=>assert.fail('unexpected failure')})
 assert.equal(result.rows,20);assert.equal(reads,15);assert.equal(scrolls,14)
})
test('bounded failure preserves evidence and original validation error',async()=>{
 let saved
 await assert.rejects(capturePostSnapshot({read:()=>({rows:10}),validate:()=>{throw Error('twelve required')},scroll:()=>{},wait:async()=>{},attempts:3,saveFailure:c=>saved=c}),/twelve required/)
 assert.deepEqual(saved,{rows:10})
})
