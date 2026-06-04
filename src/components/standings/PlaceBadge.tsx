export function PlaceBadge({ place }: { place: number }) {
  if (place === 1) {
    return (
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: 'color-mix(in srgb, var(--gold) 15%, transparent)', color: 'var(--gold)' }}
      >
        <span className="font-display text-sm tabular-nums">1</span>
      </div>
    )
  }
  if (place === 2) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-400/20 text-zinc-300">
        <span className="font-display text-sm tabular-nums">2</span>
      </div>
    )
  }
  if (place === 3) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-700/30 text-zinc-400">
        <span className="font-display text-sm tabular-nums">3</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-800 text-zinc-500">
      <span className="font-display text-sm tabular-nums">{place}</span>
    </div>
  )
}
