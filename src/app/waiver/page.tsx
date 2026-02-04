'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'

export default function WaiverPage() {
  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero Section */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-3xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="text-section-heading mb-4">Participant Agreement</p>
              <h1 className="text-display mb-6">
                Liability Waiver & <span className="text-heat-jalapeno">Media Release</span>
              </h1>
              <p className="text-xl text-zinc-400">
                All participants must read and agree to the following terms before competing in any Let&apos;s Pepper event.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Waiver Content */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="max-w-3xl space-y-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Quick Summary */}
              <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-6">
                <h2 className="font-display text-xl uppercase text-heat-jalapeno mb-4">
                  Quick Summary
                </h2>
                <ul className="space-y-2 text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-heat-jalapeno mt-1">•</span>
                    You understand volleyball involves physical risk and participate voluntarily
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-jalapeno mt-1">•</span>
                    You release Let&apos;s Pepper, Flickday Media, and venue owners from liability
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-jalapeno mt-1">•</span>
                    You consent to being photographed and filmed for promotional use
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-jalapeno mt-1">•</span>
                    Minors (under 18) must have a parent/guardian sign on their behalf
                  </li>
                </ul>
              </div>

              {/* Section 1: Assumption of Risk */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  1. Assumption of Risk
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    I understand that participation in Let&apos;s Pepper volleyball tournaments involves inherent risks, including but not limited to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Physical injury from athletic activity, including sprains, strains, fractures, or other bodily harm</li>
                    <li>Collisions with other players, equipment, or fixed objects</li>
                    <li>Injuries related to playing surface conditions (grass, uneven terrain, wet conditions)</li>
                    <li>Weather-related incidents including heat exhaustion, dehydration, lightning, or sun exposure</li>
                    <li>Illness or communicable disease transmission</li>
                  </ul>
                  <p>
                    I voluntarily assume full responsibility for any and all risks of injury, illness, or death that may result from my participation in Let&apos;s Pepper events, whether or not caused by the negligence of the Released Parties.
                  </p>
                </div>
              </div>

              {/* Section 2: Liability Release */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  2. Release of Liability
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    In consideration of being permitted to participate in Let&apos;s Pepper events, I hereby release, waive, discharge, and covenant not to sue the following parties (collectively, the &ldquo;Released Parties&rdquo;):
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Let&apos;s Pepper and its organizers, officers, directors, employees, and volunteers</li>
                    <li>Flickday Media and Nino Chavez Photography</li>
                    <li>Event sponsors, partners, and affiliates</li>
                    <li>Venue owners, operators, and landowners</li>
                    <li>Other participants and spectators</li>
                  </ul>
                  <p>
                    This release applies to any and all claims, demands, actions, or causes of action arising out of or related to any loss, damage, or injury (including death) that may be sustained by me during my participation in Let&apos;s Pepper events, or while on the premises of any event venue.
                  </p>
                </div>
              </div>

              {/* Section 3: Media Consent */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  3. Media Consent & Likeness Release
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    I grant Let&apos;s Pepper, Flickday Media, Nino Chavez Photography, and their affiliates the irrevocable right and permission to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Photograph, film, and record me during Let&apos;s Pepper events</li>
                    <li>Livestream event footage that may include my likeness</li>
                    <li>Use my name, image, likeness, and voice in any media format</li>
                  </ul>
                  <p>
                    I understand my likeness may be used in:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Photo galleries and tournament recaps</li>
                    <li>Promotional videos and highlight reels</li>
                    <li>Social media content (Instagram, TikTok, YouTube, etc.)</li>
                    <li>Website content and brand storytelling</li>
                    <li>Print and digital marketing materials</li>
                  </ul>
                  <p>
                    I waive any right to inspect or approve the final media products and agree to this usage without compensation. This consent is perpetual and extends to all affiliated content channels.
                  </p>
                </div>
              </div>

              {/* Section 4: Medical Authorization */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  4. Medical Authorization
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    I certify that I am physically fit and have no medical condition that would prevent my participation in volleyball activities. In the event of an emergency, I authorize Let&apos;s Pepper staff to seek and consent to medical treatment on my behalf if I am unable to do so.
                  </p>
                  <p>
                    I understand that Let&apos;s Pepper does not provide medical insurance coverage for participants. I am responsible for my own health insurance and medical expenses.
                  </p>
                </div>
              </div>

              {/* Section 5: Code of Conduct */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  5. Code of Conduct
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    I agree to conduct myself in a sportsmanlike manner and abide by all tournament rules. I understand that unsportsmanlike conduct, including but not limited to verbal abuse, physical altercations, or intentional rule violations, may result in immediate disqualification without refund.
                  </p>
                  <p>
                    Let&apos;s Pepper operates on a trust-based, self-officiated format. I agree to call my own violations honestly and respect the calls of other players.
                  </p>
                </div>
              </div>

              {/* Section 6: Minors */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  6. Minor Participants
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    For participants under 18 years of age: A parent or legal guardian must read, understand, and agree to all terms of this waiver on behalf of the minor participant.
                  </p>
                  <p>
                    By signing on behalf of a minor, the parent/guardian agrees to all terms herein, including the assumption of risk, release of liability, and media consent, on the minor&apos;s behalf.
                  </p>
                </div>
              </div>

              {/* Section 7: Governing Law */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  7. Governing Law
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    This waiver shall be governed by and construed in accordance with the laws of the State of Illinois. Any dispute arising from this waiver or participation in Let&apos;s Pepper events shall be resolved in the courts of Illinois.
                  </p>
                  <p>
                    If any provision of this waiver is found to be unenforceable, the remaining provisions shall remain in full force and effect.
                  </p>
                </div>
              </div>

              {/* Agreement Section */}
              <div className="bg-heat-jalapeno/10 border border-heat-jalapeno/30 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-2xl uppercase text-heat-jalapeno">
                  Agreement
                </h2>
                <p className="text-zinc-300 leading-relaxed">
                  By registering for and participating in any Let&apos;s Pepper event, I acknowledge that I have read this waiver in its entirety, understand its contents, and agree to be bound by its terms. I am signing this waiver voluntarily and of my own free will.
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  <strong>Digital agreement:</strong> Completing online registration constitutes acceptance of this waiver.
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  <strong>Paper waiver:</strong> If required, a signed copy can be submitted at event check-in.
                </p>
              </div>

              {/* Contact */}
              <div className="text-zinc-500 text-sm">
                <p>
                  Questions about this waiver? Contact us at{' '}
                  <a
                    href="https://instagram.com/letspepper.open"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-heat-jalapeno transition-colors"
                  >
                    @letspepper.open
                  </a>
                </p>
                <p className="mt-4">Last updated: February 2026</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section-padding bg-gradient-to-t from-pepper-charcoal/50 to-transparent">
          <div className="section-container text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              className="space-y-6"
            >
              <h2 className="font-display text-3xl uppercase text-white">
                Ready to compete?
              </h2>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/#series" className="btn-primary">
                  <span>View Events</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link href="/faq" className="btn-secondary">
                  <span>Read FAQ</span>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
