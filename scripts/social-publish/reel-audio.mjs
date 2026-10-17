/** Instagram Audio API contract (Facebook Login), checked 2026-10-17.
 * https://developers.facebook.com/documentation/instagram-platform/content-publishing/audio-api
 * Shared by the CLI and scheduler. Music is never silently dropped or substituted.
 */
export function audioConfiguration(item) {
  const config = item.audio_configuration
  if (config === undefined) return null
  if ((item.media_type || 'REELS') !== 'REELS') throw new Error('Instagram catalog audio applies to REELS only')
  if (item.channels?.includes('facebook')) throw new Error('Instagram catalog audio cannot be crossposted to Facebook by this publisher; use a separate Facebook item')
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('audio_configuration must be an object')
  for (const key of Object.keys(config)) {
    if (!['audio_id', 'audio_volume', 'video_volume'].includes(key)) throw new Error(`Unsupported audio_configuration field: ${key}`)
  }
  if (typeof config.audio_id !== 'string' || !/^\d+$/.test(config.audio_id)) throw new Error('audio_id must be a numeric string from Instagram audio search')
  const result = { audio_id: config.audio_id }
  for (const key of ['audio_volume', 'video_volume']) {
    if (config[key] === undefined) continue
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 100) throw new Error(`${key} must be an integer from 1 to 100`)
    result[key] = config[key]
  }
  return result
}

export function audioParams(item) {
  const config = audioConfiguration(item)
  return config ? { audio_configuration: JSON.stringify(config) } : {}
}

export function audioFromArgs(args, mediaType) {
  const flags = ['audio-id', 'audio-volume', 'video-volume']
  if (!flags.some(key => args[key] !== undefined)) return undefined
  const config = { audio_id: args['audio-id'] }
  for (const [flag, field] of [['audio-volume', 'audio_volume'], ['video-volume', 'video_volume']]) {
    if (args[flag] === undefined) continue
    if (typeof args[flag] !== 'string' || !/^\d+$/.test(args[flag])) throw new Error(`--${flag} requires an integer from 1 to 100`)
    config[field] = Number(args[flag])
  }
  return audioConfiguration({ media_type: mediaType, audio_configuration: config })
}
