/** Read-only Graph client. No container creation, queue writes or publication. */
const GRAPH = 'https://graph.facebook.com/v25.0'

export async function audioGet(token, path, params = {}, { fetchImpl = fetch, graph = GRAPH } = {}) {
  const url = new URL(`${graph}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  let response
  try {
    response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) })
  } catch {
    throw new Error('Instagram read failed or timed out; no publication attempted')
  }
  let data
  try { data = await response.json() } catch { throw new Error(`Instagram returned non-JSON (HTTP ${response.status})`) }
  if (!response.ok || data.error) {
    const error = data.error || {}
    const message = String(error.message || 'Graph request failed').split(token).join('[redacted]')
    const failure = new Error(`${message} (HTTP ${response.status}, code ${error.code ?? 'unknown'}, subcode ${error.error_subcode ?? 'none'})`)
    failure.code = error.code
    failure.subcode = error.error_subcode
    throw failure
  }
  return data
}

export async function searchAudio(token, igId, { query, type = 'music', ...client } = {}) {
  if (!/^\d+$/.test(igId)) throw new Error('A verified numeric Instagram user ID is required')
  if (!['music', 'original_sound'].includes(type)) throw new Error('Audio type must be music or original_sound')
  const data = await audioGet(token, 'ig_audio', { audio_type: type, user_id: igId, ...(query ? { search_query: query } : {}) }, client)
  if (!Array.isArray(data.audio)) throw new Error('Unexpected Instagram audio response: missing audio array')
  return data.audio
}

export async function getAudio(token, igId, audioId, client = {}) {
  if (!/^\d+$/.test(audioId) || !/^\d+$/.test(igId)) throw new Error('Numeric Instagram and audio IDs are required')
  return audioGet(token, audioId, { user_id: igId }, client)
}

export async function checkAudioAccess(token, account, client = {}) {
  const report = { checked_at: new Date().toISOString(), expected_handle: account.handle, read_only: true }
  // Keep checks independent: an audio permission failure must not erase proof
  // that the token still reads the intended Page/Instagram account.
  for (const [key, path, params] of [
    ['token', 'debug_token', { input_token: token }],
    ['instagram', account.ig_user_id, { fields: 'id,username' }],
    ['page', account.page_id, { fields: 'id,name,instagram_business_account{id,username}' }],
  ]) {
    try {
      const data = await audioGet(token, path, params, client)
      if (key === 'token') {
        const t = data.data || {}
        report.token = Object.fromEntries(['is_valid', 'type', 'app_id', 'expires_at', 'data_access_expires_at', 'scopes'].map(k => [k, t[k] ?? null]))
      } else report[key] = data
    } catch (error) { report[key] = { error: error.message } }
  }
  report.identity_verified = report.instagram?.id === account.ig_user_id && report.instagram?.username === account.handle && report.page?.id === account.page_id && report.page?.instagram_business_account?.id === account.ig_user_id
  try {
    const audio = await searchAudio(token, account.ig_user_id, { query: 'instrumental', ...client })
    report.audio = { accessible: true, returned: audio.length }
  } catch (error) { report.audio = { accessible: false, error: error.message } }
  report.ready_to_search = report.identity_verified && report.token?.is_valid === true && report.audio.accessible
  return report
}
