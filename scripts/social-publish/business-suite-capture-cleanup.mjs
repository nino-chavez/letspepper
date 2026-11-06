/** Run a browser capture, then always close its tabs without letting cleanup hide the result. */
const describe=error=>{
 if(!error)return null
 const stderr=typeof error.stderr==='string'?error.stderr.trim().slice(-2000):''
 return [error.message,stderr&&!String(error.message).includes(stderr)?stderr:''].filter(Boolean).join('\n')
}

// The capture error is the one to report: a stalled `browse-tabs close-owned` must not replace it.
// A cleanup failure after a validated capture is recorded and left non-fatal, so a good report survives.
export async function finishCapture({work,cleanup,record}){
 let result,failure,failed=false
 try{result=await work()}catch(error){failure=error;failed=true}
 let cleanupError=null
 try{cleanup()}catch(error){cleanupError=error}
 const at=new Date().toISOString()
 if(failed){
  record('capture-failed',{status:'failed',failed_at:at,message:describe(failure),stack:failure?.stack??null,cleanup_error:describe(cleanupError)})
  throw failure
 }
 if(cleanupError){
  record('capture-cleanup-failed',{status:'cleanup_failed',failed_at:at,message:describe(cleanupError)})
  console.error('Browser tab cleanup failed after a validated capture: '+cleanupError.message)
 }
 return result
}
