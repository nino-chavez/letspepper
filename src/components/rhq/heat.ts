/** Heat → Tailwind class maps shared across the RHQ embed components. */

export type Heat = 'bell' | 'poblano' | 'jalapeno'

export const heatText: Record<Heat, string> = {
  bell: 'text-heat-bell',
  poblano: 'text-heat-poblano',
  jalapeno: 'text-heat-jalapeno',
}

export const heatBg: Record<Heat, string> = {
  bell: 'bg-heat-bell',
  poblano: 'bg-heat-poblano',
  jalapeno: 'bg-heat-jalapeno',
}

export const heatBorder: Record<Heat, string> = {
  bell: 'border-heat-bell',
  poblano: 'border-heat-poblano',
  jalapeno: 'border-heat-jalapeno',
}
