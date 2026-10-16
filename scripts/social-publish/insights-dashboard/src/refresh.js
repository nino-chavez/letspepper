/** Refresh saved readings without interrupting a form, an open explanation, or activity. */
export function refreshWhenIdle() {
  const due=Date.now()+5*60*1000
  let lastActivity=Date.now()
  for (const event of ['pointerdown','keydown','input','scroll']) document.addEventListener(event,()=>{lastActivity=Date.now()},{passive:true})
  const check=()=>{
    if (Date.now()<due || Date.now()-lastActivity<60000 || document.visibilityState!=='visible') return
    if (document.querySelector('dialog[open],details[open]') || document.activeElement?.matches('input,select,textarea')) return
    location.reload()
  }
  setInterval(check,15000)
  document.addEventListener('visibilitychange',check)
}
