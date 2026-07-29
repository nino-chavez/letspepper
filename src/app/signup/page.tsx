import SignupClient, { type SignupFormSource } from './SignupClient'

export const runtime = 'edge'

const SOURCE_MAP: Record<string, SignupFormSource> = {
  facebook: 'Facebook',
  fb: 'Facebook',
  meta: 'Facebook',
  instagram: 'Instagram',
  ig: 'Instagram',
  volleyballlife: 'VolleyballLife',
  'volleyball-life': 'VolleyballLife',
  volleyball_life: 'VolleyballLife',
  vbl: 'VolleyballLife',
  teammate: 'Teammate or friend',
  friend: 'Teammate or friend',
  referral: 'Teammate or friend',
  google: 'Google or search',
  bing: 'Google or search',
  search: 'Google or search',
  'letspepper.com': 'Let’s Pepper website',
  letspepper: 'Let’s Pepper website',
  website: 'Let’s Pepper website',
}

function resolveFormSource(rawSource: string | string[] | undefined): SignupFormSource | null {
  const source = Array.isArray(rawSource) ? rawSource[0] : rawSource

  if (!source) {
    return null
  }

  return SOURCE_MAP[source.trim().toLowerCase()] ?? 'Other'
}

export default function SignupPage({
  searchParams,
}: {
  searchParams?: { utm_source?: string | string[] }
}) {
  return <SignupClient formSource={resolveFormSource(searchParams?.utm_source)} />
}
