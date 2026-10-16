/** Describe observed changes without assigning a cause or inventing a threshold. */
export function followerInsight(current, previous = []) {
  const total = rows => rows.length && rows.every(r => ['follows','unfollows'].every(k => Number.isInteger(r[k]) && r[k] >= 0))
    ? rows.reduce((sum,r) => ({ follows:sum.follows+r.follows, unfollows:sum.unfollows+r.unfollows }), { follows:0, unfollows:0 }) : null
  const now=total(current), before=previous.length===current.length?total(previous):null
  if (!now) return { state:'incomplete', heading:'Check missing readings before acting.', detail:'A full-period follower comparison needs both counts for every day.', action:'Open Data status and check the missing dates. Missing does not mean zero.' }
  if (!before) return { state:'baseline', heading:'Use these counts as a baseline.', detail:'An equally long, complete earlier period is unavailable. We cannot say whether departures increased.', action:'Keep collecting complete periods. A net gain or loss alone does not explain who left or why.' }
  const follows=now.follows-before.follows, unfollows=now.unfollows-before.unfollows
  const change=(n,label)=>n===0?`${label} were unchanged`:`${Math.abs(n)} ${n>0?'more':'fewer'} ${label}`
  const heading=follows===0&&unfollows===0?'Period totals matched the previous period.':`${change(follows,'follows')}; ${change(unfollows,'unfollows')}.`
  return { state:'comparison', heading, current:now, previous:before,
    detail:`Compared with the previous ${previous.length} days. These differences do not establish a lasting pattern or explain why people left.`,
    action:unfollows>0?'Inspect the days with more departures and any known program or season changes. Counts alone do not justify changing the content plan.':follows<0?'Inspect reach and the posts from these dates to investigate fewer arrivals. This does not establish that a particular post caused the change.':'Keep the current period as evidence and watch whether the pattern repeats. Do not change the content plan on these counts alone.' }
}
