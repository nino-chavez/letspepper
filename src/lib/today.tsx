'use client'

import { createContext, useContext, useEffect, useState } from 'react'

/**
 * "Today" for anything that renders differently by date: whether registration
 * is open, the next event, the series label, the footer year, a pick deadline.
 *
 * Reading the date while rendering is wrong on a prebuilt page. The HTML carries
 * the build's date, the browser's first render uses the visitor's, and when the
 * two straddle a date that matters (an event day, New Year) React logs a
 * hydration error and the page flashes from one state to the other.
 *
 * The root layout passes the moment it rendered at: the build's for a prebuilt
 * page, the request's for one rendered per request. The browser's first render
 * uses that same moment, so it matches the HTML exactly. After mount the
 * visitor's clock takes over and keeps moving, so a tab left open still locks at
 * a deadline and still changes state at midnight.
 */
const TodayContext = createContext<string | null>(null)
const NowContext = createContext<number | null>(null)

/** YYYY-MM-DD in UTC: the form the tournament date checks compare against. */
export function toISODate(ms: number): string {
  return new Date(ms).toISOString().split('T')[0]
}

/** How often the clock moves after mount, so an open tab crosses deadlines and midnights. */
const TICK_MS = 30_000

export function TodayProvider({ renderedAt, children }: { renderedAt: number; children: React.ReactNode }) {
  const [now, setNow] = useState(renderedAt)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  // Two contexts: a string only changes at midnight, so date readers re-render
  // once a day, while the few deadline checks follow every tick.
  return (
    <TodayContext.Provider value={toISODate(now)}>
      <NowContext.Provider value={now}>{children}</NowContext.Provider>
    </TodayContext.Provider>
  )
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error('useTodayISO and useNow need <TodayProvider>, which src/app/layout.tsx provides')
  return value
}

/** Today as YYYY-MM-DD (UTC). Safe to read while rendering; moves at midnight UTC. */
export function useTodayISO(): string {
  return required(useContext(TodayContext))
}

/** The current time in ms. Safe to read while rendering; moves every 30 s after mount. */
export function useNow(): number {
  return required(useContext(NowContext))
}
