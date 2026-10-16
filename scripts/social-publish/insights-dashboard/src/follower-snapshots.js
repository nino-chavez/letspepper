const ACCOUNT = '630volleyball'

export async function loadFollowerSnapshots(db, params = new URLSearchParams()) {
  let snapshots
  try {
    snapshots = (await db.prepare('SELECT snapshot_id, exported_at, imported_at, handle_count FROM follower_handle_snapshots WHERE account=? ORDER BY exported_at DESC').bind(ACCOUNT).all()).results
  } catch(error) {
    if (/no such table: follower_handle_snapshots/.test(error.message)) return {state:'unavailable',snapshots:[]}
    throw error
  }
  if (!snapshots.length) return {state:'empty',snapshots}
  const selected = snapshots.find(s => s.snapshot_id === params.get('snapshot')) ?? snapshots[0]
  const previous = snapshots[snapshots.indexOf(selected)+1] ?? null
  const read = async snapshot => {
    const row = await db.prepare('SELECT handles_json FROM follower_handle_snapshots WHERE account=? AND snapshot_id=?').bind(ACCOUNT,snapshot.snapshot_id).first()
    const handles = JSON.parse(row.handles_json)
    if (!Array.isArray(handles) || handles.length !== snapshot.handle_count || new Set(handles).size !== handles.length || handles.some(h => typeof h !== 'string' || !/^[a-z0-9_.]{1,30}$/.test(h))) throw Error('Invalid stored follower snapshot')
    return handles
  }
  const [current, before] = await Promise.all([read(selected),previous?read(previous):Promise.resolve([])])
  const currentSet = new Set(current), beforeSet = new Set(before)
  const added = previous ? current.filter(h => !beforeSet.has(h)) : []
  const absent = previous ? before.filter(h => !currentSet.has(h)) : []
  const counts = {all:current.length,added:previous?added.length:null,absent:previous?absent.length:null,retained:previous?current.length-added.length:null}
  const filter = previous && ['added','absent'].includes(params.get('filter')) ? params.get('filter') : 'all'
  const query = (params.get('q')??'').trim().toLowerCase().replace(/^@/,'').slice(0,30)
  const matching = ({all:current,added,absent}[filter]).filter(h => h.includes(query)).sort()
  const pages = Math.max(1,Math.ceil(matching.length/100)), requestedPage = Number(params.get('p')??1)
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1,Math.min(pages,requestedPage)) : 1
  return {state:previous?'comparison':'baseline',snapshots,selected,previous,counts,filter,query,page,pages,total:matching.length,handles:matching.slice((page-1)*100,page*100)}
}
