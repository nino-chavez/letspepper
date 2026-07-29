'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { activeCancellation, nextOpenEvent } from '@/lib/tournaments'

const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSekSFGfAlPtyzjeVhgPPpZhSOwNsYNAVBib0YeIWQMNT1pRYQ/viewform'
const GOOGLE_FORM_SOURCE_ENTRY = 'entry.2041884314'

export type SignupFormSource =
  | 'Instagram'
  | 'Facebook'
  | 'VolleyballLife'
  | 'Teammate or friend'
  | 'Google or search'
  | 'Let’s Pepper website'
  | 'Other'

function buildFormUrl(formSource: SignupFormSource | null, embedded = false) {
  const searchParams = new URLSearchParams()

  if (embedded) {
    searchParams.set('embedded', 'true')
  }

  if (formSource) {
    searchParams.set(GOOGLE_FORM_SOURCE_ENTRY, formSource)
  }

  const query = searchParams.toString()
  return query ? `${GOOGLE_FORM_URL}?${query}` : GOOGLE_FORM_URL
}

export default function SignupClient({ formSource }: { formSource: SignupFormSource | null }) {
  const embeddedFormUrl = buildFormUrl(formSource, true)
  const responderFormUrl = buildFormUrl(formSource)
  // The embedded Google Form lists whichever event it was last configured for and
  // cannot be closed from this codebase. So when nothing is open for registration,
  // this page stops rendering it — otherwise a header link lands a player on a
  // roster form for an event the rest of the site says is cancelled.
  const today = new Date().toISOString().split('T')[0]
  const openEvent = nextOpenEvent(today)
  const cancelled = activeCancellation(today)

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-3xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="text-section-heading mb-4">Team Registration</p>
              <h1 className="text-display mb-6">
                {openEvent ? (
                  <>
                    Sign Up Your <span className="text-heat-jalapeno">Team</span>
                  </>
                ) : (
                  <>
                    Registration Is <span className="text-zinc-500">Closed</span>
                  </>
                )}
              </h1>
              <p className="text-xl text-zinc-400">
                {openEvent
                  ? "Pick your tournament, drop your roster, and we'll DM your captain on Instagram to confirm."
                  : 'There is no Let’s Pepper event open for registration right now.'}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Form */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="mx-auto max-w-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {openEvent ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900/30">
                    <iframe
                      src={embeddedFormUrl}
                      title="Let's Pepper team signup form"
                      className="w-full"
                      height={2300}
                      loading="lazy"
                    >
                      Loading…
                    </iframe>
                  </div>

                  <p className="mt-6 text-center text-sm text-zinc-500">
                    Trouble loading the form?{' '}
                    <a
                      href={responderFormUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-heat-jalapeno underline-offset-4 hover:underline"
                    >
                      Open it in a new tab
                    </a>
                    .
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-6 sm:p-8 space-y-4">
                  {cancelled ? (
                    <p className="text-zinc-300 leading-relaxed">
                      The <span className="font-semibold text-white">{cancelled.name}</span> on{' '}
                      {cancelled.date} was cancelled, and it was the last event on this
                      season&apos;s calendar.{' '}
                      <Link
                        href={`/flavors/${cancelled.slug}`}
                        className="text-white underline underline-offset-4 hover:text-heat-jalapeno transition-colors"
                      >
                        Read the notice
                      </Link>
                      .
                    </p>
                  ) : (
                    <p className="text-zinc-300 leading-relaxed">
                      The season is complete. Next season&apos;s dates go up here first.
                    </p>
                  )}
                  <p className="text-zinc-400 leading-relaxed">
                    Season results are final at{' '}
                    <Link
                      href="/standings"
                      className="text-white underline underline-offset-4 hover:text-heat-jalapeno transition-colors"
                    >
                      the standings
                    </Link>
                    . Follow{' '}
                    <a
                      href="https://www.instagram.com/letspepper.open/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white underline underline-offset-4 hover:text-heat-jalapeno transition-colors"
                    >
                      @letspepper.open
                    </a>{' '}
                    for the next dates.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
