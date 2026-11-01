/** Wait for Meta's next ten-row page without relaxing snapshot validation. */
export async function capturePostSnapshot({read,validate,scroll,saveFailure,wait=()=>new Promise(r=>setTimeout(r,1000)),attempts=45,now=Date.now,maxWaitMs=90000}) {
 let capture,error,readError,scrollError
 const deadline=now()+maxWaitMs
 for(let i=0;i<attempts && now()<deadline;i++) {
  let fresh
  try { fresh=await read(); readError=null } catch(e) { readError=e }
  if(fresh) {
   capture=fresh
   try { validate(capture); return capture } catch(e) { error=e }
  }
  if(i===attempts-1 || now()>=deadline) break
  try { await scroll(); scrollError=null } catch(e) { scrollError=e.message }
  await wait()
 }
 if(capture) await saveFailure(capture,{scroll_error:scrollError??null,read_error:readError?.message??null})
 throw error??readError??Error('Post capture timed out')
}
