'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'

export default function PrivacyPage() {
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
              <p className="text-section-heading mb-4">Your Data</p>
              <h1 className="text-display mb-6">
                Privacy <span className="text-heat-bell">Policy</span>
              </h1>
              <p className="text-xl text-zinc-400">
                How Let&apos;s Pepper collects, uses, and protects your information.
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
                <h2 className="font-display text-xl uppercase text-heat-bell mb-4">
                  Quick Summary
                </h2>
                <ul className="space-y-2 text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-heat-bell mt-1">•</span>
                    We collect basic info for event registration (name, email, team details)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-bell mt-1">•</span>
                    Photos and videos from events may feature you and be shared publicly
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-bell mt-1">•</span>
                    We don&apos;t sell your personal information to third parties
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-heat-bell mt-1">•</span>
                    Contact us anytime to request removal from galleries or mailing lists
                  </li>
                </ul>
              </div>

              {/* Section 1: Information We Collect */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  1. Information We Collect
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p><strong className="text-zinc-300">Registration Information</strong></p>
                  <p>When you register for a Let&apos;s Pepper event, we collect:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Name and contact information (email, phone number)</li>
                    <li>Team name and teammate information</li>
                    <li>Payment information (processed securely through third-party providers)</li>
                    <li>Emergency contact details</li>
                    <li>Waiver acknowledgment and signature</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Event Media</strong></p>
                  <p>During events, we capture:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Photographs of gameplay, participants, and event activities</li>
                    <li>Video footage including highlight reels and livestreams</li>
                    <li>Audio recordings as part of video content</li>
                  </ul>

                  <p className="pt-4"><strong className="text-zinc-300">Website Usage</strong></p>
                  <p>When you visit our website, we may collect:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Browser type and device information</li>
                    <li>Pages visited and time spent on site</li>
                    <li>Referring website or source</li>
                  </ul>
                </div>
              </div>

              {/* Section 2: How We Use Your Information */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  2. How We Use Your Information
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>We use the information we collect to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Process event registrations and communicate event details</li>
                    <li>Organize brackets, pools, and tournament logistics</li>
                    <li>Contact you about upcoming events and announcements</li>
                    <li>Publish results, standings, and tournament recaps</li>
                    <li>Create and share promotional content (photos, videos, highlights)</li>
                    <li>Improve our events and website experience</li>
                  </ul>
                </div>
              </div>

              {/* Section 3: Media and Content Sharing */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  3. Media and Content Sharing
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    By participating in Let&apos;s Pepper events, you consent to being photographed and filmed. This media may be shared on:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Our website and photo galleries (gallery.ninochavez.co)</li>
                    <li>Social media platforms (@letspepper.open, @flickday.media)</li>
                    <li>YouTube and other video platforms</li>
                    <li>Partner and sponsor channels</li>
                    <li>Print and digital marketing materials</li>
                  </ul>
                  <p>
                    See our <Link href="/waiver" className="text-heat-jalapeno hover:underline">Waiver</Link> for complete media consent terms.
                  </p>
                </div>
              </div>

              {/* Section 4: Third-Party Services */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  4. Third-Party Services
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>We use the following third-party services:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong className="text-zinc-300">Payment Processing:</strong> Secure payment through Stripe or similar providers</li>
                    <li><strong className="text-zinc-300">Email:</strong> Event communications and announcements</li>
                    <li><strong className="text-zinc-300">Photo Hosting:</strong> SmugMug for gallery hosting</li>
                    <li><strong className="text-zinc-300">Analytics:</strong> Website usage tracking (anonymized)</li>
                    <li><strong className="text-zinc-300">Social Media:</strong> Instagram, TikTok, YouTube for content distribution</li>
                  </ul>
                  <p>
                    These services have their own privacy policies. We encourage you to review them.
                  </p>
                </div>
              </div>

              {/* Section 5: Data Retention */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  5. Data Retention
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    <strong className="text-zinc-300">Registration data:</strong> Retained for the duration of your participation in Let&apos;s Pepper events, plus a reasonable period for record-keeping and future event communications.
                  </p>
                  <p>
                    <strong className="text-zinc-300">Media content:</strong> Photos and videos are retained indefinitely as part of our event archives and promotional materials unless you request removal.
                  </p>
                  <p>
                    <strong className="text-zinc-300">Results and standings:</strong> Tournament results are maintained as a permanent historical record.
                  </p>
                </div>
              </div>

              {/* Section 6: Your Rights */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  6. Your Rights
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>You have the right to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Request access to the personal information we hold about you</li>
                    <li>Request correction of inaccurate information</li>
                    <li>Request removal from our mailing list</li>
                    <li>Request removal of specific photos from our public galleries (reasonable requests honored)</li>
                    <li>Request deletion of your registration data (subject to legal retention requirements)</li>
                  </ul>
                  <p>
                    To exercise these rights, contact us via Instagram at @letspepper.open.
                  </p>
                </div>
              </div>

              {/* Section 7: Data Security */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  7. Data Security
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    We take reasonable measures to protect your personal information from unauthorized access, alteration, or destruction. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
                  </p>
                  <p>
                    Payment information is processed through secure, PCI-compliant third-party providers. We do not store credit card details.
                  </p>
                </div>
              </div>

              {/* Section 8: Children's Privacy */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  8. Children&apos;s Privacy
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    Participants under 18 must have a parent or guardian register on their behalf and consent to our privacy practices. We do not knowingly collect personal information directly from children under 13.
                  </p>
                </div>
              </div>

              {/* Section 9: Changes to This Policy */}
              <div className="space-y-4">
                <h2 className="font-display text-2xl uppercase text-white">
                  9. Changes to This Policy
                </h2>
                <div className="text-zinc-400 space-y-4 leading-relaxed">
                  <p>
                    We may update this privacy policy from time to time. Significant changes will be communicated through our website or email. Continued participation in events after changes constitutes acceptance of the updated policy.
                  </p>
                </div>
              </div>

              {/* Contact */}
              <div className="text-zinc-500 text-sm">
                <p>
                  Questions about this policy? Contact us at{' '}
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
