/**
 * Let's Pepper - Predictions / Pepper Props Data
 * Prop bets for the next open event.
 */

import { nextOpenEvent } from '@/lib/tournaments'

export type PropHeat = 'bell' | 'jalapeno' | 'reaper'

export interface PredictionProp {
  id: string
  question: string
  options: string[]
  heat: PropHeat
  points: number
  category: 'matchup' | 'stats' | 'culture' | 'wild'
  correctAnswer?: number // index, revealed post-event
}

export interface PredictionEvent {
  id: string
  event: string
  deadline: string // ISO date
  isLocked: boolean
  resultsRevealed: boolean
  props: PredictionProp[]
}

const HEAT_POINTS: Record<PropHeat, number> = {
  bell: 1,
  jalapeno: 3,
  reaper: 5,
}

export function getPointsForHeat(heat: PropHeat): number {
  return HEAT_POINTS[heat]
}

/**
 * The culture quiz for one event. The "who wins" call is the Rally HQ-backed
 * ChampionPick card (real teams, auto-scored); these props are the rest.
 */
function propsFor(eventName: string): PredictionProp[] {
  return [
    {
      id: 'pool-to-podium',
      question: 'Will the team that tops pool play also win the whole thing?',
      options: ['Yes — they carry it through', 'No — the bracket flips the script'],
      heat: 'jalapeno',
      points: 3,
      category: 'matchup',
    },
    {
      id: 'upset',
      question: 'Biggest upset: does a bottom-half seed finish top 3?',
      options: ['Yes', 'No way'],
      heat: 'reaper',
      points: 5,
      category: 'matchup',
    },
    {
      id: 'total-teams',
      question: `How many teams check in for the ${eventName}?`,
      options: ['8 or fewer', '9-12', '13-16', '17+'],
      heat: 'bell',
      points: 1,
      category: 'stats',
    },
    {
      id: 'longest-match',
      question: 'Will any match go to a third set?',
      options: ['Yes, multiple', 'Yes, just one', 'No — all straight sets'],
      heat: 'bell',
      points: 1,
      category: 'stats',
    },
    {
      id: 'ace-leader',
      question: 'Which position will have the most aces?',
      options: ['Setter', 'Hitter', 'Defender/DS'],
      heat: 'jalapeno',
      points: 3,
      category: 'stats',
    },
    {
      id: 'weather',
      question: 'Will weather affect the tournament?',
      options: ['Perfect day', 'Brief delay', 'Major delay / reschedule'],
      heat: 'jalapeno',
      points: 3,
      category: 'wild',
    },
    {
      id: 'first-ace',
      question: 'First ace of the tournament happens in:',
      options: ['First match', 'Second match', 'Third match or later'],
      heat: 'bell',
      points: 1,
      category: 'stats',
    },
    {
      id: 'celebration',
      question: 'Best celebration of the day?',
      options: ['Chest bump', 'Team pile-up', 'Stoic fist pump', 'Something we\'ve never seen'],
      heat: 'bell',
      points: 1,
      category: 'culture',
    },
    {
      id: 'photo-moment',
      question: 'Flickday Media\'s photo of the day will feature:',
      options: ['A diving save', 'A monster kill', 'A celebration', 'A candid sideline moment'],
      heat: 'jalapeno',
      points: 3,
      category: 'culture',
    },
    {
      id: 'food',
      question: 'Most popular sideline snack?',
      options: ['Chips & dip', 'Fruit', 'Fast food', 'Protein bars'],
      heat: 'bell',
      points: 1,
      category: 'culture',
    },
    {
      id: 'champion-dropped-set',
      question: 'Will the champion drop a set on the way to the title?',
      options: ['No — clean run', 'Yes — they survive one scare', 'Yes — multiple close calls'],
      heat: 'reaper',
      points: 5,
      category: 'matchup',
    },
    {
      id: 'mvp-vote',
      question: 'The MVP vote will be won by someone who:',
      options: ['Won the tournament', 'Made the finals', 'Didn\'t even podium'],
      heat: 'jalapeno',
      points: 3,
      category: 'wild',
    },
    {
      id: 'pepper-pun',
      question: 'Total pepper puns heard throughout the day?',
      options: ['0-5', '6-10', '11-20', '20+'],
      heat: 'bell',
      points: 1,
      category: 'wild',
    },
    {
      id: 'final-score',
      question: 'Championship match final set winning score:',
      options: ['15 (no deuce)', '16-18 (close deuce)', '19+ (marathon)'],
      heat: 'reaper',
      points: 5,
      category: 'matchup',
    },
  ]
}

/**
 * The event picks are open for: the next one a team can enter, by the test the
 * header's Sign Up / Registration Closed link uses. Picks lock at its first
 * serve. Null when nothing is open (the off-season), so the page never asks
 * for picks on an event that has been played or called off.
 *
 * Until 2026-10-09 this was a hand-edited list pinned to the 2026 Bell Pepper
 * Open, which kept asking for picks four months after it was played.
 */
export function currentPredictionEvent(todayISO: string): PredictionEvent | null {
  const t = nextOpenEvent(todayISO)
  if (!t) return null
  return {
    // Must match the Rally HQ tournament slug: the champion card and scoring
    // resolve against it.
    id: t.rhqSlug,
    event: `${t.name} ${t.startsAt.slice(0, 4)}`,
    deadline: t.startsAt,
    isLocked: false,
    resultsRevealed: false,
    props: propsFor(t.name),
  }
}

/** Calculate prediction score for an event */
export function calculatePredictionScore(
  event: PredictionEvent,
  userPicks: Record<string, number>
): { total: number; correct: number; possible: number } {
  if (!event.resultsRevealed) return { total: 0, correct: 0, possible: 0 }

  let total = 0
  let correct = 0
  const possible = event.props.reduce((sum, p) => sum + p.points, 0)

  for (const prop of event.props) {
    if (prop.correctAnswer !== undefined && userPicks[prop.id] === prop.correctAnswer) {
      total += prop.points
      correct++
    }
  }

  return { total, correct, possible }
}
