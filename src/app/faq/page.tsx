'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'

interface FAQItem {
  question: string
  answer: string
}

interface FAQCategory {
  title: string
  icon: string
  color: string
  items: FAQItem[]
}

const faqCategories: FAQCategory[] = [
  {
    title: 'General Info',
    icon: '📍',
    color: 'text-heat-bell',
    items: [
      {
        question: "When's the next tournament?",
        answer: 'Check the individual event pages for upcoming dates. The Bell Pepper Open kicks off the season, followed by the Jalapeño Open mid-season, and the Poblano Open to close things out.',
      },
      {
        question: 'What time does the tournament start?',
        answer: 'First serve is at 9:00 AM sharp. Be on-site by 8:30 AM to check in and warm up.',
      },
      {
        question: 'Where are tournaments held?',
        answer: 'Locations vary by event. Check the specific tournament page for venue details, parking info, and directions.',
      },
      {
        question: 'Is there parking?',
        answer: 'Yes — parking lot and street parking are typically available at our venues. Check the event page for specifics.',
      },
      {
        question: 'Are there bathrooms on-site?',
        answer: "Depends on the venue. Some parks don't have facilities — we'll note this on the event page so you can plan ahead.",
      },
      {
        question: 'Can I get a refund if I drop last minute?',
        answer: 'No refunds within 24 hours of the event. We need accurate team counts to run brackets.',
      },
    ],
  },
  {
    title: 'Rules',
    icon: '📋',
    color: 'text-heat-jalapeno',
    items: [
      {
        question: 'Do we call our own violations?',
        answer: "Yes — call your own and be honest. This is a trust-based format. We're all here to compete, not argue.",
      },
      {
        question: 'Are let serves allowed?',
        answer: 'Nope — no let serves. If it hits the net and goes over, it\'s live.',
      },
      {
        question: 'Can I hand set the serve or a free ball?',
        answer: 'Yes — clean hand setting on serves and free balls is allowed. Keep it tight.',
      },
      {
        question: 'Can I open hand tip?',
        answer: 'No open hand tipping. Period. Roll shot or cut shot only.',
      },
      {
        question: 'Are doubles called?',
        answer: 'Yes — no doubles. Even in system. Keep your hands clean.',
      },
      {
        question: 'When do we switch sides?',
        answer: 'Switch every 7 points. Keep it fair, especially with the wind.',
      },
    ],
  },
  {
    title: 'Format',
    icon: '🏐',
    color: 'text-heat-poblano',
    items: [
      {
        question: "What's the pool play format?",
        answer: '4-team pools play 2 sets to 21, cap at 23. 3-team pools play 3 sets to 21, cap at 23. Every point matters for seeding.',
      },
      {
        question: 'Do all teams make playoffs?',
        answer: "Yes — everyone advances. Win or lose in pools, you're playing bracket ball. No one goes home early.",
      },
      {
        question: 'How do playoffs work?',
        answer: 'Early rounds are 1 game to 30, no cap — win by 2. Semifinals and finals are best of 3: games to 21, 21, 15 if needed.',
      },
      {
        question: 'How many players per team?',
        answer: "It's grass triples — 3 players per team. No subs during a match. Bring your crew.",
      },
    ],
  },
  {
    title: 'Prizes & Media',
    icon: '💰',
    color: 'text-white',
    items: [
      {
        question: 'What do winners get?',
        answer: 'Cash prizes for top finishers. Prize pool scales with team participation — bigger field means bigger payouts.',
      },
      {
        question: 'Is there media coverage?',
        answer: 'Yes — professional photo and video coverage by Flickday Media at all Let\'s Pepper events. Your moments get captured.',
      },
      {
        question: 'Where can I find photos after the event?',
        answer: 'Galleries are posted to gallery.ninochavez.co within a few days of the event. Taggable, downloadable, and shareable.',
      },
      {
        question: 'Will there be highlight reels?',
        answer: 'Yes — post-tournament highlight reels are produced for major events. Follow @flickday.media for drops.',
      },
    ],
  },
]

function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-zinc-800/50">
      <button
        type="button"
        onClick={onToggle}
        className="w-full py-5 flex items-center justify-between text-left group"
        aria-expanded={isOpen}
      >
        <span className="text-lg text-white group-hover:text-heat-jalapeno transition-colors pr-4">
          {item.question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-2xl text-zinc-500 group-hover:text-heat-jalapeno transition-colors flex-shrink-0"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: MOTION.ease.outExpo }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-zinc-400 leading-relaxed pr-12">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FAQSection({ category, openIndex, setOpenIndex, categoryIndex }: {
  category: FAQCategory
  openIndex: string | null
  setOpenIndex: (index: string | null) => void
  categoryIndex: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={MOTION.viewport.once}
      transition={{ duration: 0.6, delay: categoryIndex * 0.1 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl" aria-hidden="true">{category.icon}</span>
        <h2 className={cn('font-display text-2xl uppercase', category.color)}>
          {category.title}
        </h2>
      </div>
      <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 px-6">
        {category.items.map((item, itemIndex) => {
          const key = `${categoryIndex}-${itemIndex}`
          return (
            <FAQAccordion
              key={key}
              item={item}
              isOpen={openIndex === key}
              onToggle={() => setOpenIndex(openIndex === key ? null : key)}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null)

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
              <p className="text-section-heading mb-4">Got Questions?</p>
              <h1 className="text-display mb-6">
                Frequently Asked <span className="text-heat-jalapeno">Questions</span>
              </h1>
              <p className="text-xl text-zinc-400">
                Everything you need to know about playing in Let&apos;s Pepper tournaments — rules, format, logistics, and more.
              </p>
            </motion.div>
          </div>
        </section>

        {/* FAQ Categories */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <div className="grid lg:grid-cols-2 gap-12">
              {faqCategories.map((category, categoryIndex) => (
                <FAQSection
                  key={category.title}
                  category={category}
                  openIndex={openIndex}
                  setOpenIndex={setOpenIndex}
                  categoryIndex={categoryIndex}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Still Have Questions CTA */}
        <section className="section-padding bg-gradient-to-t from-pepper-charcoal/50 to-transparent">
          <div className="section-container">
            <motion.div
              className="text-center max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
            >
              <h2 className="font-display text-3xl uppercase text-white mb-4">
                Still Have Questions?
              </h2>
              <p className="text-zinc-400 mb-8">
                Hit us up on Instagram. We&apos;re real people who actually respond.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="https://instagram.com/letspepper.open"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  <span>@letspepper.open</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <Link href="/#series" className="btn-secondary">
                  <span>View Events</span>
                  <span aria-hidden="true">→</span>
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
