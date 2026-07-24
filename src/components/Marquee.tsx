'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/motion'

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

const variantStyles = {
  live: {
    bg: 'bg-[var(--live)]/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-[var(--live)]/90',
    gradientVia: 'via-[var(--live)]/90',
    buttonBg: 'bg-pepper-black/20 hover:bg-pepper-black/30',
    buttonText: 'text-pepper-black',
  },
  belle: {
    bg: 'bg-belle-primary/90',
    text: 'text-white',
    highlight: 'text-yellow-300',
    gradientFrom: 'from-belle-primary/90',
    gradientVia: 'via-belle-primary/90',
    buttonBg: 'bg-white/20 hover:bg-white/30',
    buttonText: 'text-white',
  },
  jalapeno: {
    bg: 'bg-heat-jalapeno/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-heat-jalapeno/90',
    gradientVia: 'via-heat-jalapeno/90',
    buttonBg: 'bg-pepper-black/20 hover:bg-pepper-black/30',
    buttonText: 'text-pepper-black',
  },
  bell: {
    bg: 'bg-heat-bell/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-heat-bell/90',
    gradientVia: 'via-heat-bell/90',
    buttonBg: 'bg-pepper-black/20 hover:bg-pepper-black/30',
    buttonText: 'text-pepper-black',
  },
  poblano: {
    bg: 'bg-heat-poblano/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    gradientFrom: 'from-heat-poblano/90',
    gradientVia: 'via-heat-poblano/90',
    buttonBg: 'bg-pepper-black/20 hover:bg-pepper-black/30',
    buttonText: 'text-pepper-black',
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
  const [isPaused, setIsPaused] = useState(prefersReducedMotion)
  const styles = variantStyles[variant]

  // Duplicate items enough times to ensure seamless loop
  const duplicatedItems = [...items, ...items, ...items, ...items]

  const togglePause = () => {
    setIsPaused(!isPaused)
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
        marginLeft: '-5%',
        marginRight: '-5%',
        width: '110%',
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
            'absolute right-4 top-1/2 -translate-y-1/2 z-20',
            'w-8 h-8 rounded-full flex items-center justify-center',
            'transition-all duration-200 cursor-pointer',
            styles.buttonBg,
            styles.buttonText,
            'focus:outline-none focus:ring-2 focus:ring-pepper-black/50 focus:ring-offset-1'
          )}
          aria-label={isPaused ? 'Play announcement' : 'Pause announcement'}
          aria-pressed={isPaused}
          style={{
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

const upcomingEvents = [
  { name: 'Bell Pepper Open', slug: 'bell-pepper-open-2026', date: '2026-06-07', displayDate: 'June 7', variant: 'bell' as const },
  { name: 'Jalapeño Open', slug: 'jalapeno-open-2026', date: '2026-07-18', displayDate: 'July 18', variant: 'jalapeno' as const },
  { name: 'Poblano Open', slug: 'poblano-open-2026', date: '2026-08-01', displayDate: 'Aug 1', variant: 'poblano' as const, payout: '$2,000 at 28 Teams' },
]

/**
 * Dynamic "Next Up" announcement marquee
 * Shows the next upcoming event, or an off-season fallback (belle-purple variant).
 * Progressive enhancement: checks /api/rhq/summary for is_live and upgrades
 * the banner to a LIVE NOW state (--live coral) when the event is active.
 * Falls back to date-gated logic if the fetch fails.
 * WCAG 2.2.2 compliant with pause controls and reduced motion support.
 */
export function NextEventMarquee({ className }: { className?: string }) {
  const today = new Date().toISOString().split('T')[0]
  const next = upcomingEvents.find((e) => e.date >= today)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    if (!next) return
    fetch(`/api/rhq/summary?slug=${encodeURIComponent(next.slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.is_live === true) setIsLive(true)
      })
      .catch(() => {/* fall back to date logic */})
  }, [next?.slug])

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
        ...('payout' in next && next.payout ? [{ text: next.payout, highlight: true }, { text: '〰️' }] : []),
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
