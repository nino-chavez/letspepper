/**
 * Let's Pepper - localStorage Utility
 * Typed helpers for persisting feature state client-side.
 */

/** Namespaced storage keys for all features */
export const STORAGE_KEYS = {
  // Quiz
  QUIZ_RESULT: 'lp_quiz_result',
  // Bingo
  BINGO_MARKS: 'lp_bingo_marks',
  BINGO_SEED: 'lp_bingo_seed',
  // Predictions
  PREDICTIONS_PREFIX: 'lp_predictions_',
  // Champion pick (Rally HQ-backed) + shared cross-surface nickname
  CHAMPION_PREFIX: 'lp_champion_',
  FAN_NICKNAME: 'lp_fan_nickname',
  // Awards
  AWARDS_VOTES: 'lp_awards_votes',
  // MVP Vote
  MVP_VOTE_PREFIX: 'lp_mvp_vote_',
  // Hot Takes
  HOT_TAKES_CUSTOM: 'lp_hot_takes_custom',
  HOT_TAKES_REACTIONS: 'lp_hot_takes_reactions',
  // Photo Vote
  PHOTO_VOTE: 'lp_photo_vote',
  // Device ID
  DEVICE_ID: 'lp_device_id',
} as const

/** Type-safe getter with JSON parse */
export function getStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Type-safe setter with JSON stringify */
export function setStoredValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — fail silently
  }
}

/** Generate or retrieve a stable device UUID for vote deduplication */
export function getDeviceId(): string {
  const existing = getStoredValue<string>(STORAGE_KEYS.DEVICE_ID, '')
  if (existing) return existing

  const id = crypto.randomUUID()
  setStoredValue(STORAGE_KEYS.DEVICE_ID, id)
  return id
}
