'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'

export default function TermsPage() {
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
              <p className="text-section-heading mb-4">The Rules</p>
              <h1 className="text-display mb-6">
                Terms of <span className="text-heat-poblano">Service</span>
              </h1>
              <p className="text-xl text-zinc-400">
                Terms and conditions for participating in Let&apos;s Pepper events and using our website.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Content */}
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
                <h2 className="font-display text-xl uppercase text-heat-poblano mb-4">
                  Quick Summary
                </h2>
                <ul className="space-y-2 text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-heat-poblano mt-1">•</span>
                    Register by the deadline — late entries are not guaranteed
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-poblano mt-1">•</span>
                    No refunds within 24 hours of an event
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-poblano mt-1">•</span>
                    Play fair, call your own violations, respect other players
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-poblano mt-1">•</span>
                    Unsportsmanlike conduct = disqualification without refund
                  </li>
                </ul>
              </div>

              {/* Section 1: Event Registration */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  1. Event Registration
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p><strong className="text-zinc-300">Registration Process</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Registration is completed through our designated registration platform</li>
                    <li>All team members must be listed at the time of registration</li>
                    <li>Registration is not confirmed until payment is received in full</li>
                    <li>Spots are limited and filled on a first-come, first-served basis</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Registration Deadlines</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Registration typically closes 48-72 hours before event day</li>
                    <li>Late registrations may be accepted at organizer discretion with a late fee</li>
                    <li>Day-of registration is not available</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Team Requirements</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Grass triples format: 3 players per team</li>
                    <li>All team members must check in before the event start time</li>
                    <li>Roster changes may be requested but are subject to approval</li>
                  </ul>
                </div>
              </div>

              {/* Section 2: Payment and Refunds */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  2. Payment and Refunds
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p><strong className="text-zinc-300">Payment</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Entry fees vary by event and are listed on each event page</li>
                    <li>Payment is due at the time of registration</li>
                    <li>Accepted payment methods are specified during checkout</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Refund Policy</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong className="text-zinc-300">More than 7 days before event:</strong> Full refund available</li>
                    <li><strong className="text-zinc-300">3-7 days before event:</strong> 50% refund or credit toward future event</li>
                    <li><strong className="text-zinc-300">Within 24 hours of event:</strong> No refunds</li>
                    <li>No refunds for no-shows or disqualifications</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Event Cancellation</strong></p>
                  <p>
                    If Let&apos;s Pepper cancels an event due to weather or other circumstances beyond our control, registered teams will receive a full refund or credit toward a future event.
                  </p>
                </div>
              </div>

              {/* Section 3: Tournament Rules */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  3. Tournament Rules
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p><strong className="text-zinc-300">Format</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Grass triples (3v3) format on outdoor grass courts</li>
                    <li>Pool play followed by single-elimination bracket</li>
                    <li>Specific scoring formats are announced for each event</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Self-Officiated Play</strong></p>
                  <p>
                    Let&apos;s Pepper operates on a trust-based, self-officiated format. Players are expected to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Call their own violations honestly</li>
                    <li>Respect the calls made by opponents</li>
                    <li>Resolve disputes respectfully between teams</li>
                    <li>Seek tournament staff assistance only when necessary</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">House Rules</strong></p>
                  <p>
                    Specific rules (let serves, hand setting, side switches, etc.) are announced before each event. See our <Link href="/faq" className="text-heat-jalapeno hover:underline">FAQ</Link> for common rules.
                  </p>
                </div>
              </div>

              {/* Section 4: Code of Conduct */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  4. Code of Conduct
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>All participants are expected to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Treat all players, spectators, and staff with respect</li>
                    <li>Compete fairly and honestly</li>
                    <li>Refrain from abusive language, threats, or intimidation</li>
                    <li>Respect venue property and follow venue rules</li>
                    <li>Comply with all tournament staff decisions</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Prohibited Conduct</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Physical altercations or fighting</li>
                    <li>Verbal abuse or harassment of any kind</li>
                    <li>Intentional rule violations or cheating</li>
                    <li>Excessive arguing or unsportsmanlike behavior</li>
                    <li>Intoxication that affects play or behavior</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Consequences</strong></p>
                  <p>
                    Violations may result in warnings, point deductions, game forfeiture, immediate disqualification, or ban from future events—at the sole discretion of tournament organizers. No refunds are provided for disqualifications.
                  </p>
                </div>
              </div>

              {/* Section 5: Prizes and Payouts */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  5. Prizes and Payouts
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Prize pools are announced for each event and scale with registration numbers</li>
                    <li>Payouts are distributed to winning teams at the conclusion of the event</li>
                    <li>Prize distribution within teams is the responsibility of the team</li>
                    <li>Let&apos;s Pepper reserves the right to adjust prize structures as needed</li>
                    <li>Winners are responsible for any applicable taxes on prize winnings</li>
                  </ul>
                </div>
              </div>

              {/* Section 6: Liability and Waiver */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  6. Liability and Waiver
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    All participants must agree to our <Link href="/waiver" className="text-heat-jalapeno hover:underline">Liability Waiver and Media Release</Link> as a condition of participation. This includes assumption of risk, release of liability, and consent to media capture and usage.
                  </p>
                </div>
              </div>

              {/* Section 7: Website Use */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  7. Website Use
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>By using the Let&apos;s Pepper website, you agree to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Use the site for lawful purposes only</li>
                    <li>Provide accurate information when registering</li>
                    <li>Not attempt to interfere with site functionality</li>
                    <li>Respect intellectual property rights</li>
                  </ul>
                  <p>
                    Website content, including logos, images, and text, is the property of Let&apos;s Pepper and Flickday Media unless otherwise noted.
                  </p>
                </div>
              </div>

              {/* Section 8: Changes to Terms */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  8. Changes to Terms
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    We reserve the right to update these terms at any time. Continued registration for events or use of our website after changes constitutes acceptance of the updated terms.
                  </p>
                </div>
              </div>

              {/* Section 9: Governing Law */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  9. Governing Law
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    These terms are governed by the laws of the State of Illinois. Any disputes shall be resolved in the courts of Illinois.
                  </p>
                </div>
              </div>

              {/* Contact */}
              <div className="text-zinc-500 text-sm">
                <p>
                  Questions about these terms? Contact us at{' '}
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
      </main>

      <Footer />
    </>
  )
}
