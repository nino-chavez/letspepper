/** Central midnight, with two offset passes for daylight-saving changes. */
export function centralMidnight(day) {
  const wall=Date.parse(day+'T00:00:00Z')
  let instant=wall
  for(let i=0;i<2;i++) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]))
    const rendered=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
    instant=wall-(rendered-instant)
  }
  return new Date(instant).toISOString().slice(0,19)
}
