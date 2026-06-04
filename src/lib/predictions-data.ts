/**
 * Let's Pepper - Predictions / Pepper Props Data
 * Prop bets for upcoming events.
 */

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

export const predictionEvents: PredictionEvent[] = [
  {
    // Targets the upcoming series tournament. `id` MUST match the Rally HQ
    // tournament slug — the champion card + scoring resolve against it.
    id: 'bell-pepper-open-2026',
    event: 'Bell Pepper Open 2026',
    deadline: '2026-06-07T08:00:00-05:00',
    isLocked: false,
    resultsRevealed: false,
    // NOTE: the "who wins" pick is now the Rally HQ-backed ChampionPick card
    // (real teams, auto-scored). The props below are the bespoke culture quiz —
    // retargeted for the Bell Pepper Open (no prior-season references; this is
    // the series opener).
    props: [
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
        question: 'How many teams check in for the Bell Pepper Open?',
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
    ],
  },
]

/** Calculate prediction score for an event */
export function calculatePredictionScore(
  eventId: string,
  userPicks: Record<string, number>
): { total: number; correct: number; possible: number } {
  const event = predictionEvents.find(e => e.id === eventId)
  if (!event || !event.resultsRevealed) return { total: 0, correct: 0, possible: 0 }

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
