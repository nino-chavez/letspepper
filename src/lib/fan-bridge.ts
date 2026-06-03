/**
 * Fan-identity bridge (server-side).
 *
 * Resolves a local `device_id` to its Rally HQ `fan_token`, minting one on first
 * contact and reusing it forever after. This is the activation point of Rally HQ
 * ADR-0007: every Let's Pepper participant becomes a Rally-HQ-known fan, so their
 * cross-surface engagement (champion picks today, more later) lands on ONE unified
 * leaderboard regardless of which surface they acted on.
 *
 * Best-effort throughout: if Rally HQ is unreachable, callers get null and fall
 * back to the local-only flow. A local pick must never fail because the bridge did.
 */

import { supabase } from './supabase'
import { issueFan, updateFanName } from './rally-hq'

interface DeviceFanRow {
  fan_token: string
}

/**
 * Get-or-mint the Rally HQ fan_token for a device, syncing the nickname.
 *
 * @returns the fan_token, or null if no cross-surface identity could be established.
 */
export async function resolveFanToken(
  deviceId: string,
  nickname: string | null
): Promise<string | null> {
  // Existing mapping wins — the fan_token is stable across events.
  const { data: existing } = await supabase
    .from('lp_device_fans')
    .select('fan_token')
    .eq('device_id', deviceId)
    .maybeSingle<DeviceFanRow>()

  if (existing?.fan_token) {
    // Keep the unified leaderboard named: push a (changed) nickname through.
    if (nickname) {
      await updateFanName(existing.fan_token, nickname)
    }
    return existing.fan_token
  }

  // First engagement from this device — mint a fan on Rally HQ.
  const fan = await issueFan(nickname)
  if (!fan) return null

  const { error } = await supabase
    .from('lp_device_fans')
    .insert({ device_id: deviceId, fan_token: fan.fanToken })

  if (error) {
    // A concurrent submit may have inserted first; re-read rather than duplicate.
    const { data: raced } = await supabase
      .from('lp_device_fans')
      .select('fan_token')
      .eq('device_id', deviceId)
      .maybeSingle<DeviceFanRow>()
    return raced?.fan_token ?? fan.fanToken
  }

  return fan.fanToken
}
