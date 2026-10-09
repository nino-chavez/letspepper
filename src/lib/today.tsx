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
 * uses that same moment, so it matches the HTML exactly; the visitor's clock
 * replaces it after mount.
 */
interface Clock {
  /** YYYY-MM-DD, UTC — the form the tournament date checks compare against. */
  todayISO: string
  /** Milliseconds since the epoch. */
  now: number
}

const ClockContext = createContext<Clock | null>(null)

export function clockAt(now: number): Clock {
  return { todayISO: new Date(now).toISOString().split('T')[0], now }
}

export function TodayProvider({ renderedAt, children }: { renderedAt: number; children: React.ReactNode }) {
  const [clock, setClock] = useState(() => clockAt(renderedAt))
  useEffect(() => {
    setClock(clockAt(Date.now()))
  }, [])
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
}

function useClock(): Clock {
  const clock = useContext(ClockContext)
  if (!clock) throw new Error('useTodayISO and useNow need <TodayProvider>, which src/app/layout.tsx provides')
  return clock
}

/** Today as YYYY-MM-DD (UTC). Safe to read while rendering. */
export function useTodayISO(): string {
  return useClock().todayISO
}

/** The current time in ms. Safe to read while rendering; refreshed once after mount. */
export function useNow(): number {
  return useClock().now
}
