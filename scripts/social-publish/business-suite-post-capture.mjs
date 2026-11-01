/** Wait for Meta's next ten-row page without relaxing snapshot validation. */
export async function capturePostSnapshot({read,validate,scroll,saveFailure,wait=()=>new Promise(r=>setTimeout(r,1000)),attempts=45}) {
 let capture,error
 for(let i=0;i<attempts;i++) {
  capture=await read()
  try { validate(capture); return capture } catch(e) { error=e }
  if(i===attempts-1) break
  await scroll()
  await wait()
 }
 await saveFailure(capture)
 throw error
}
