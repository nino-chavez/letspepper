/**
 * Let's Pepper - "What Pepper Are You?" Quiz
 * 7 questions with personality-based scoring.
 */

export type PepperPersonality = 'bell' | 'poblano' | 'jalapeno' | 'habanero' | 'reaper' | 'pepperX'

export interface QuizOption {
  text: string
  scores: Partial<Record<PepperPersonality, number>>
  /** If set, selecting this option short-circuits the quiz to this result */
  easterEgg?: PepperPersonality
}

export interface QuizQuestion {
  question: string
  options: QuizOption[]
}

export interface PepperResult {
  id: PepperPersonality
  title: string
  tagline: string
  description: string
  traits: string[]
  heatLevel: number // 1-5
  color: string // tailwind text class
  bgColor: string // tailwind bg class
}

export const quizQuestions: QuizQuestion[] = [
  {
    question: 'It\'s match point. Your team is down. What\'s your move?',
    options: [
      { text: 'Serve it safe and let the team rally', scores: { bell: 3, jalapeno: 1 } },
      { text: 'Float serve to the weakest passer', scores: { poblano: 3, jalapeno: 1 } },
      { text: 'Bomb it. Full power. No hesitation.', scores: { habanero: 3, reaper: 1 } },
      { text: 'Serve your toughest ball at a clear target', scores: { reaper: 3, habanero: 1 } },
      { text: 'Sky ball. Make the wind part of the play.', scores: {}, easterEgg: 'pepperX' },
    ],
  },
  {
    question: 'How do you show up to a tournament?',
    options: [
      { text: 'On time, warmed up, ready to go', scores: { jalapeno: 3, poblano: 1 } },
      { text: 'Matching team outfits, music already playing', scores: { bell: 3, jalapeno: 1 } },
      { text: 'First ones there, already stretching', scores: { habanero: 3, poblano: 1 } },
      { text: 'Already tracked the wind and picked a serving side', scores: { reaper: 3, bell: 1 } },
    ],
  },
  {
    question: 'Your teammate shanks an easy pass. You...',
    options: [
      { text: '"You\'re good! Next one!"', scores: { bell: 3, jalapeno: 1 } },
      { text: 'Say nothing, adjust your positioning', scores: { poblano: 3, jalapeno: 1 } },
      { text: 'Clap once, reset, and get ready for the next ball', scores: { habanero: 3, poblano: 1 } },
      { text: '"We\'ll talk about it after the set"', scores: { jalapeno: 3, habanero: 1 } },
    ],
  },
  {
    question: 'What\'s your ideal tournament soundtrack?',
    options: [
      { text: 'Lo-fi or reggae — something steady', scores: { bell: 3, jalapeno: 1 } },
      { text: 'Whatever the DJ plays, I\'m locked in', scores: { poblano: 3, bell: 1 } },
      { text: 'Hype playlist — rap, EDM, pump-up anthems', scores: { habanero: 3, reaper: 1 } },
      { text: 'Silence. I need to focus.', scores: { reaper: 3, poblano: 1 } },
    ],
  },
  {
    question: 'Pick your post-tournament meal:',
    options: [
      { text: 'Pizza with the team', scores: { bell: 3, jalapeno: 1 } },
      { text: 'Protein shake and recovery meal', scores: { habanero: 3, poblano: 1 } },
      { text: 'Whatever\'s closest — I\'m starving', scores: { jalapeno: 3, bell: 1 } },
      { text: 'Grab food, then start swapping match clips', scores: { reaper: 3, habanero: 1 } },
    ],
  },
  {
    question: 'Your team wins the whole thing. What\'s the celebration?',
    options: [
      { text: 'Group photo and high fives all around', scores: { bell: 3, poblano: 1 } },
      { text: 'Cool head nod — you knew it was coming', scores: { poblano: 3, jalapeno: 1 } },
      { text: 'Big team huddle, let the crowd know', scores: { habanero: 3, reaper: 1 } },
      { text: '"When\'s the next tournament?"', scores: { reaper: 3, habanero: 1 } },
    ],
  },
  {
    question: 'What matters most to you about volleyball?',
    options: [
      { text: 'The community and friendships', scores: { bell: 3, jalapeno: 2 } },
      { text: 'Getting better every time I play', scores: { poblano: 3, habanero: 1 } },
      { text: 'The competition — winning matters', scores: { habanero: 3, reaper: 1 } },
      { text: 'The craft — clean plays, smart ball', scores: { jalapeno: 3, poblano: 1 } },
    ],
  },
]

export const pepperResults: Record<PepperPersonality, PepperResult> = {
  bell: {
    id: 'bell',
    title: 'Bell Pepper',
    tagline: 'Keeps the team connected',
    description: 'You make the whole team better. You communicate, keep people engaged, and know competition and community can share the same court. Every roster needs that presence.',
    traits: ['Team player', 'Positive energy', 'Community builder', 'Raises the group'],
    heatLevel: 1,
    color: 'text-heat-bell',
    bgColor: 'bg-heat-bell',
  },
  poblano: {
    id: 'poblano',
    title: 'Poblano',
    tagline: 'Quietly dangerous',
    description: 'Quiet confidence, clean execution. You don\'t need to be the loudest on the court — your game speaks for itself. Opponents learn quickly.',
    traits: ['Calculated', 'Clutch performer', 'Under the radar', 'Smart player'],
    heatLevel: 2,
    // Maps to heat level 2 (poblano) in the shared heat color system — see heat-config.ts
    color: 'text-heat-poblano',
    bgColor: 'bg-heat-poblano',
  },
  jalapeno: {
    id: 'jalapeno',
    title: 'Jalapeño',
    tagline: 'Smooth veteran',
    description: 'You\'ve seen it all and done it all. Your game is refined, your touch is clean, and you make everyone around you better. The seasoned veteran who never panics.',
    traits: ['Experienced', 'Composed', 'Versatile', 'Leader'],
    heatLevel: 3,
    color: 'text-heat-jalapeno',
    bgColor: 'bg-heat-jalapeno',
  },
  habanero: {
    id: 'habanero',
    title: 'Habanero',
    tagline: 'Intense competitor',
    description: 'Your intensity shows on every rally. When you lock in, the whole team raises its level. You play to win and everyone knows it.',
    traits: ['Intense', 'Passionate', 'Competitive', 'Motivator'],
    heatLevel: 4,
    color: 'text-heat-habanero',
    bgColor: 'bg-heat-habanero',
  },
  reaper: {
    id: 'reaper',
    title: 'Carolina Reaper',
    tagline: 'Sets the pace',
    description: 'You bring urgency to every rally and reset quickly between points. Your focus changes the pace of a match, and your teammates know you will stay engaged.',
    traits: ['Relentless', 'Composed under pressure', 'High motor', 'Sets the tempo'],
    heatLevel: 5,
    color: 'text-red-600',
    bgColor: 'bg-red-600',
  },
  pepperX: {
    id: 'pepperX',
    title: 'Pepper X',
    tagline: 'The wildcard',
    description: 'You chose the sky ball. That says enough. You read the court differently, take calculated risks, and make unconventional plays work.',
    traits: ['Unpredictable', 'Sky ball specialist', 'Creative', 'Confident'],
    heatLevel: 5,
    color: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-500',
  },
}

/** Calculate quiz result from answer indices */
export function calculateResult(answers: number[]): PepperPersonality {
  const scores: Record<PepperPersonality, number> = {
    bell: 0,
    poblano: 0,
    jalapeno: 0,
    habanero: 0,
    reaper: 0,
    pepperX: 0,
  }

  answers.forEach((answerIndex, questionIndex) => {
    const question = quizQuestions[questionIndex]
    if (!question) return
    const option = question.options[answerIndex]
    if (!option) return
    for (const [personality, points] of Object.entries(option.scores)) {
      scores[personality as PepperPersonality] += points
    }
  })

  // Priority order for tie-breaking
  const priority: PepperPersonality[] = ['reaper', 'habanero', 'jalapeno', 'poblano', 'bell']

  let maxScore = 0
  let result: PepperPersonality = 'bell'

  for (const personality of priority) {
    if (scores[personality] > maxScore) {
      maxScore = scores[personality]
      result = personality
    }
  }

  return result
}
