/**
 * Let's Pepper - Hot Takes Data
 * Pre-seeded takes for V1.
 */

export interface HotTake {
  id: string
  text: string
  author: string
  heat: 'bell' | 'jalapeno' | 'poblano' | 'habanero' | 'reaper'
}

export const seededTakes: HotTake[] = [
  {
    id: 'take-1',
    text: 'Podgorny and Meyer aren\'t just the best duo — they might be the best team in Illinois grass volleyball. Period.',
    author: 'Anonymous',
    heat: 'habanero',
  },
  {
    id: 'take-2',
    text: 'The Vandenberg brothers would win if they played every weekend. Raw talent is there — they just need reps.',
    author: 'Anonymous',
    heat: 'jalapeno',
  },
  {
    id: 'take-3',
    text: 'Maas, Zediker, and Sauer are the most underrated team in the series. Two bronzes isn\'t luck — it\'s consistency.',
    author: 'Anonymous',
    heat: 'poblano',
  },
  {
    id: 'take-4',
    text: 'Let\'s Pepper needs a doubles division. Triples is great, but 2v2 grass would test a completely different game.',
    author: 'Anonymous',
    heat: 'bell',
  },
  {
    id: 'take-5',
    text: 'The 9th-to-2nd comeback by Haynes/Mensching/Veldman is the best storyline in Let\'s Pepper history.',
    author: 'Anonymous',
    heat: 'jalapeno',
  },
  {
    id: 'take-6',
    text: 'There should be a consolation bracket with its own prize. Give every team a reason to keep competing.',
    author: 'Anonymous',
    heat: 'bell',
  },
  {
    id: 'take-7',
    text: 'Ian Schuller is the biggest "what if" — one event, one championship. What happens with a full season?',
    author: 'Anonymous',
    heat: 'habanero',
  },
  {
    id: 'take-8',
    text: 'Grass volleyball > beach volleyball. The rallies cover more ground and every player has to defend more court.',
    author: 'Anonymous',
    heat: 'reaper',
  },
  {
    id: 'take-9',
    text: 'The Poblano Open could have the most competitive field yet. The recent results point to a deep bracket.',
    author: 'Anonymous',
    heat: 'poblano',
  },
  {
    id: 'take-10',
    text: 'Let\'s Pepper is what happens when volleyball people actually care about the player experience. More of this.',
    author: 'Anonymous',
    heat: 'bell',
  },
  {
    id: 'take-11',
    text: 'Nick Maruyama is the best pure volleyball player in the series but needs a championship to prove it.',
    author: 'Anonymous',
    heat: 'habanero',
  },
  {
    id: 'take-12',
    text: 'The Flickday Media coverage is what separates Let\'s Pepper from every other grass tournament. Content matters.',
    author: 'Anonymous',
    heat: 'bell',
  },
]
