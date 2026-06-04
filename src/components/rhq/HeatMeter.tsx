import { cn } from '@/lib/utils'
import { type Heat, heatBg } from './heat'

/**
 * The heat-scale glyph — the LPO signature motif. A segmented meter that fills
 * to the event's tier on the Scoville-correct ramp (bell 1 → poblano 2 →
 * jalapeño 3). One component, reused at every scale (hero, section headers,
 * cards) so the heat scale reads as a brand asset, not a one-off badge.
 */
const HEAT_BARS: Record<Heat, number> = { bell: 1, poblano: 2, jalapeno: 3 }

export function HeatMeter({
  heat,
  size = 'md',
  className,
}: {
  heat: Heat
  size?: 'sm' | 'md'
  className?: string
}) {
  const filled = HEAT_BARS[heat]
  const bar = size === 'sm' ? 'w-2 h-4' : 'w-3 h-6'
  return (
    <div className={cn('flex gap-1', className)} aria-label={`Heat level ${filled} of 3`}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn('rounded-sm transition-colors', bar, i <= filled ? heatBg[heat] : 'bg-zinc-700')}
        />
      ))}
    </div>
  )
}
