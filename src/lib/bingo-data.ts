/**
 * Let's Pepper - Bingo Data
 * Square pool, card generation, and win detection.
 */

export interface BingoSquareData {
  id: string
  text: string
  category: 'play' | 'culture' | 'pepper' | 'wild'
}

export const bingoSquarePool: BingoSquareData[] = [
  // Play
  { id: 'ace', text: 'Ace serve', category: 'play' },
  { id: 'dive', text: 'Diving dig', category: 'play' },
  { id: 'block', text: 'Stuff block', category: 'play' },
  { id: 'tip', text: 'Sneaky tip kill', category: 'play' },
  { id: 'setter-dump', text: 'Setter dump', category: 'play' },
  { id: 'shanked', text: 'Shanked pass off the court', category: 'play' },
  { id: 'net-serve', text: 'Serve into the net', category: 'play' },
  { id: 'pancake', text: 'Pancake save', category: 'play' },
  { id: 'skyball', text: 'Skyball serve', category: 'play' },
  { id: 'double-hit', text: 'Double hit called', category: 'play' },
  { id: 'roll-shot', text: 'Roll shot winner', category: 'play' },
  { id: 'jump-serve', text: 'Jump serve ace', category: 'play' },

  // Culture
  { id: 'lets-pepper', text: 'Someone says "Let\'s Pepper"', category: 'culture' },
  { id: 'matching', text: 'Matching team outfits', category: 'culture' },
  { id: 'cooler', text: 'Team has a full cooler', category: 'culture' },
  { id: 'music', text: 'Someone starts playing music', category: 'culture' },
  { id: 'dog', text: 'Dog on the sideline', category: 'culture' },
  { id: 'sunburn', text: 'Someone gets sunburned', category: 'culture' },
  { id: 'photo', text: 'Flickday Media gets the shot', category: 'culture' },
  { id: 'cheer', text: 'Crowd erupts on a rally', category: 'culture' },
  { id: 'trash-talk', text: 'Friendly trash talk', category: 'culture' },
  { id: 'ref-dispute', text: 'Ref controversy', category: 'culture' },

  // Pepper-themed
  { id: 'pepper-mention', text: 'Pepper pun overheard', category: 'pepper' },
  { id: 'heat-check', text: '"Heat check" moment', category: 'pepper' },
  { id: 'spicy-play', text: 'A play described as "spicy"', category: 'pepper' },
  { id: 'bell-pepper-ref', text: 'Bell Pepper reference', category: 'pepper' },
  { id: 'bring-heat', text: '"Bring the heat" said out loud', category: 'pepper' },
  { id: 'too-hot', text: '"Too hot to handle" moment', category: 'pepper' },
  { id: 'pepper-logo', text: 'Spot the pepper logo', category: 'pepper' },
  { id: 'scoville', text: 'Someone mentions Scoville', category: 'pepper' },

  // Wild
  { id: 'parking-lot', text: 'Ball hits the parking lot', category: 'wild' },
  { id: 'wrong-court', text: 'Ball lands on wrong court', category: 'wild' },
  { id: 'rain', text: 'Weather delay or scare', category: 'wild' },
  { id: 'injury-scare', text: 'Injury scare (everyone OK)', category: 'wild' },
  { id: 'comeback', text: 'Comeback from 5+ points down', category: 'wild' },
  { id: 'upset', text: 'Major upset in bracket', category: 'wild' },
  { id: 'celebration', text: 'Over-the-top celebration', category: 'wild' },
  { id: 'food-truck', text: 'Food truck spotted', category: 'wild' },
  { id: 'grass-dive', text: 'Full-extension grass save', category: 'wild' },
  { id: 'lost-shoe', text: 'Someone loses a shoe', category: 'wild' },
  { id: 'delayed-start', text: 'Late start to a match', category: 'wild' },
  { id: 'double-contact', text: 'Questionable double contact', category: 'wild' },
]

/** Seeded random number generator */
function seededRandom(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  let state = hash
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/** Generate a 5x5 bingo card from the pool using a seed */
export function generateBingoCard(seed: string): BingoSquareData[] {
  const rng = seededRandom(seed)
  const shuffled = [...bingoSquarePool].sort(() => rng() - 0.5)
  const selected = shuffled.slice(0, 24)

  // Insert free space at center (index 12)
  const freeSpace: BingoSquareData = { id: 'free', text: 'FREE SPACE', category: 'pepper' }
  selected.splice(12, 0, freeSpace)

  return selected
}

/** Check for bingo (5 in a row) */
export function checkForBingo(marks: boolean[]): { hasBingo: boolean; winningLine: number[] | null } {
  const lines: number[][] = []

  // Rows
  for (let r = 0; r < 5; r++) {
    lines.push([r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4])
  }
  // Columns
  for (let c = 0; c < 5; c++) {
    lines.push([c, c + 5, c + 10, c + 15, c + 20])
  }
  // Diagonals
  lines.push([0, 6, 12, 18, 24])
  lines.push([4, 8, 12, 16, 20])

  for (const line of lines) {
    if (line.every(i => marks[i])) {
      return { hasBingo: true, winningLine: line }
    }
  }

  return { hasBingo: false, winningLine: null }
}
