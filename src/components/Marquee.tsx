'use client'

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
  variant?: 'belle' | 'jalapeno' | 'bell' | 'poblano'
  /** Whether to pause on hover */
  pauseOnHover?: boolean
}

const variantStyles = {
  belle: {
    bg: 'bg-belle-primary/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    divider: 'text-pepper-black/50',
  },
  jalapeno: {
    bg: 'bg-heat-jalapeno/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    divider: 'text-pepper-black/50',
  },
  bell: {
    bg: 'bg-heat-bell/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    divider: 'text-pepper-black/50',
  },
  poblano: {
    bg: 'bg-heat-poblano/90',
    text: 'text-pepper-black',
    highlight: 'text-white',
    divider: 'text-pepper-black/50',
  },
}

export function Marquee({
  items,
  speed = 20,
  rotation = -3,
  className,
  variant = 'belle',
  pauseOnHover = false,
}: MarqueeProps) {
  const prefersReducedMotion = useReducedMotion()
  const styles = variantStyles[variant]

  // Duplicate items enough times to ensure seamless loop
  const duplicatedItems = [...items, ...items, ...items, ...items]

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
      aria-label="Announcement banner"
      role="marquee"
    >
      <div
        className={cn(
          'flex whitespace-nowrap',
          !prefersReducedMotion && 'animate-marquee',
          pauseOnHover && 'hover:[animation-play-state:paused]'
        )}
        style={{
          animationDuration: prefersReducedMotion ? '0s' : `${speed}s`,
        }}
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
    </div>
  )
}

/**
 * Pre-configured Pepper Belle announcement marquee
 */
export function PepperBelleMarquee({ className }: { className?: string }) {
  return (
    <Marquee
      items={[
        { text: "Women's Pepper Belle" },
        { text: '〰️' },
        { text: 'Coming Soon', highlight: true },
        { text: '〰️' },
      ]}
      variant="belle"
      speed={25}
      rotation={-3}
      className={className}
    />
  )
}
