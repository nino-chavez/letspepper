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
test('loading-frame errors retry and retain the last table on exhaustion',async()=>{
 let reads=0,saved
 await assert.rejects(capturePostSnapshot({read:()=>({rows:++reads}),validate:()=>{throw Error('twelve required')},scroll:()=>{throw Error('screenshot failed')},wait:async()=>{},attempts:3,saveFailure:c=>saved=c}),/twelve required/)
 assert.equal(reads,3);assert.deepEqual(saved,{rows:3})
})
test('read failures retain the preceding table evidence',async()=>{
 let reads=0,saved
 await assert.rejects(capturePostSnapshot({read:()=>{if(++reads>1)throw Error('read failed');return {rows:10}},validate:()=>{throw Error('twelve required')},scroll:()=>{},wait:async()=>{},attempts:3,saveFailure:c=>saved=c}),/twelve required/)
 assert.deepEqual(saved,{rows:10});assert.equal(reads,3)
})
test('persistent loading failures are saved and retries have a wall-clock bound',async()=>{
 let clock=0,diagnostics
 await assert.rejects(capturePostSnapshot({read:()=>({rows:10}),validate:()=>{throw Error('twelve required')},scroll:()=>{throw Error('frame failed')},wait:async()=>{clock+=1000},now:()=>clock,maxWaitMs:2000,saveFailure:(c,d)=>diagnostics=d}),/twelve required/)
 assert.equal(clock,2000);assert.equal(diagnostics.scroll_error,'frame failed')
})
