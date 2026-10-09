'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/motion'
import { tournaments, isCancelled, monthDay } from '@/lib/tournaments'
import { useTodayISO } from '@/lib/today'

interface MarqueeItem {
  text: string
  highlight?: boolean
}

interface MarqueeProps {
  items: MarqueeItem[]
  /** Speed in seconds for one complete scroll cycle */
  speed?: number
  /** Rotation angle in degrees */
  rotation?: number
  /** Additional CSS classes */
  className?: string
  /** Color variant */
  variant?: 'belle' | 'jalapeno' | 'bell' | 'poblano' | 'live'
  /** Whether to pause on hover (default: true for accessibility) */
  pauseOnHover?: boolean
  /** Whether to show gradient fade on edges */
  gradient?: boolean
  /** Whether to show a pause/play button */
  showControls?: boolean
}

/**
 * How far the tape reaches past each side of its container, in % of the
 * container's width. The tape is rotated, so it is drawn wider than the
 * container to keep its tilted ends from showing a gap.
 */
const OVERHANG_PCT = 5

/**
 * The same overhang in % of the tape's own width, which is what an absolutely
 * positioned child's `right` resolves against.
 */
const OVERHANG_OF_TAPE_PCT = (OVERHANG_PCT / (100 + 2 * OVERHANG_PCT)) * 100

const variantStyles = {
  live: {
    bg: 'bg-[var(--live)]/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-[var(--live)]/90',
    gradientVia: 'via-[var(--live)]/90',
  },
  belle: {
    bg: 'bg-belle-primary/90',
    text: 'text-white',
    highlight: 'text-yellow-300',
    gradientFrom: 'from-belle-primary/90',
    gradientVia: 'via-belle-primary/90',
  },
  jalapeno: {
    bg: 'bg-heat-jalapeno/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-heat-jalapeno/90',
    gradientVia: 'via-heat-jalapeno/90',
  },
  bell: {
    bg: 'bg-heat-bell/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-heat-bell/90',
    gradientVia: 'via-heat-bell/90',
  },
  poblano: {
    bg: 'bg-heat-poblano/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-heat-poblano/90',
    gradientVia: 'via-heat-poblano/90',
  },
}

export function Marquee({
  items,
  speed = 20,
  rotation = -3,
  className,
  variant = 'belle',
  pauseOnHover = true, // Default true for accessibility
  gradient = true, // Default true for polish
  showControls = true, // Default true for WCAG 2.2.2 compliance
}: MarqueeProps) {
  const prefersReducedMotion = useReducedMotion()
  // null until the viewer presses the button; until then a reduced-motion
  // viewer starts paused
  const [userPaused, setUserPaused] = useState<boolean | null>(null)
  const isPaused = userPaused ?? prefersReducedMotion
  const styles = variantStyles[variant]

  // Duplicate items enough times to ensure seamless loop
  const duplicatedItems = [...items, ...items, ...items, ...items]

  const togglePause = () => {
    setUserPaused(!isPaused)
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden py-3',
        styles.bg,
        className
      )}
      style={{
        transform: `rotate(${rotation}deg)`,
        marginLeft: `-${OVERHANG_PCT}%`,
        marginRight: `-${OVERHANG_PCT}%`,
        width: `${100 + 2 * OVERHANG_PCT}%`,
      }}
      role="region"
      aria-label="Announcement banner"
    >
      {/* Gradient fade - left edge */}
      {gradient && (
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-16 sm:w-24 z-10 pointer-events-none',
            'bg-gradient-to-r',
            styles.gradientFrom,
            'to-transparent'
          )}
          aria-hidden="true"
        />
      )}

      {/* Scrolling content */}
      <div
        className={cn(
          'flex whitespace-nowrap',
          !isPaused && 'animate-marquee',
          pauseOnHover && !isPaused && 'hover:[animation-play-state:paused]',
          pauseOnHover && !isPaused && 'focus-within:[animation-play-state:paused]'
        )}
        style={{
          animationDuration: `${speed}s`,
        }}
        aria-live={isPaused ? 'polite' : 'off'}
      >
        {duplicatedItems.map((item, index) => (
          <span
            key={index}
            className={cn(
              'mx-4 font-display text-lg sm:text-xl md:text-2xl uppercase tracking-wider',
              item.highlight ? styles.highlight : styles.text
            )}
          >
            {item.text}
          </span>
        ))}
      </div>

      {/* Gradient fade - right edge */}
      {gradient && (
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-16 sm:w-24 z-10 pointer-events-none',
            'bg-gradient-to-l',
            styles.gradientFrom,
            'to-transparent'
          )}
          aria-hidden="true"
        />
      )}

      {/* Pause/Play button for WCAG 2.2.2 compliance */}
      {showControls && (
        <button
          type="button"
          onClick={togglePause}
          className={cn(
            'absolute top-1/2 z-20',
            'w-8 h-8 rounded-full flex items-center justify-center',
            'transition-all duration-200 cursor-pointer',
            // Opaque on every tape color: a see-through disc let the scrolling
            // text run under the icon, and on the pink tape the icon measured
            // 2.5:1 against its disc (below the 3:1 a control needs).
            'bg-pepper-black text-white hover:bg-pepper-charcoal',
            // Two-tone ring (white gap, black ring) instead of the site-wide
            // jalapeno ring, which measures 1.1-1.5:1 against the tape colors.
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-pepper-black focus-visible:ring-offset-2 focus-visible:ring-offset-white'
          )}
          // The label names the action and changes with it, so no aria-pressed:
          // a toggle's label must stay fixed when its state changes.
          aria-label={isPaused ? 'Play announcement' : 'Pause announcement'}
          style={{
            // 0.75rem inside the container's visible edge at every width. The
            // tape's own right edge sits OVERHANG_PCT past that edge, so a plain
            // `right-4` put this button off-screen from 640 px up.
            right: `calc(${OVERHANG_OF_TAPE_PCT}% + 0.75rem)`,
            // Adjust for rotation
            transform: `translateY(-50%) rotate(${-rotation}deg)`,
          }}
        >
          {isPaused ? (
            // Play icon
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            // Pause icon
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}

/**
 * The season, derived from the one tournament record. This tape used to keep its
 * own copy of every event's date and headline payout — which is exactly how it
 * kept advertising "$2,000 at a Full 28" for an event that had been called off.
 */
const seasonEvents = Object.values(tournaments)
  .map((t) => ({
    name: t.name,
    slug: t.rhqSlug,
    date: t.startsAt.slice(0, 10),
    displayDate: monthDay(t.date),
    variant: t.heat,
    cancelled: isCancelled(t),
  }))
  .sort((a, b) => a.date.localeCompare(b.date))

/**
 * Dynamic "Next Up" announcement marquee
 * Shows the next upcoming event, or an off-season fallback (belle-purple variant).
 * Progressive enhancement: checks /api/rhq/summary for is_live and upgrades
 * the banner to a LIVE NOW state (--live coral) when the event is active.
 * Falls back to date-gated logic if the fetch fails.
 * WCAG 2.2.2 compliant with pause controls and reduced motion support.
 */
export function NextEventMarquee({ className }: { className?: string }) {
  const today = useTodayISO()
  // A cancelled event is never "next up" — it is not happening, so the tape must
  // skip past it to whatever genuinely is (or to the off-season fallback).
  const next = seasonEvents.find((e) => e.date >= today && !e.cancelled)
  const nextSlug = next?.slug
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    if (!nextSlug) return
    fetch(`/api/rhq/summary?slug=${encodeURIComponent(nextSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.is_live === true) setIsLive(true)
      })
      .catch(() => {/* fall back to date logic */})
  }, [nextSlug])

  if (!next) {
    // Off-season fallback
    return (
      <Marquee
        items={[
          { text: 'Season Complete' },
          { text: '〰️' },
          { text: 'See You Next Year', highlight: true },
          { text: '〰️' },
        ]}
        variant="belle"
        speed={25}
        rotation={-3}
        className={className}
      />
    )
  }

  if (isLive) {
    // Live state — coral background, LIVE NOW label
    return (
      <Marquee
        items={[
          { text: 'Live Now', highlight: true },
          { text: '〰️' },
          { text: next.name, highlight: true },
          { text: '〰️' },
          { text: 'Aurora, IL' },
          { text: '〰️' },
        ]}
        variant="live"
        speed={20}
        rotation={-3}
        className={className}
      />
    )
  }

  return (
    <Marquee
      items={[
        { text: 'Next Up' },
        { text: '〰️' },
        { text: next.name, highlight: true },
        { text: '〰️' },
        { text: next.displayDate },
        { text: '〰️' },
        { text: 'Aurora, IL' },
        { text: '〰️' },
      ]}
      variant={next.variant}
      speed={25}
      rotation={-3}
      className={className}
    />
  )
}
