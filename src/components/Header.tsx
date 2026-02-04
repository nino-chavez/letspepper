'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MOTION } from '@/lib/motion'

const navLinks = [
  { href: '/#series', label: 'The Series' },
  { href: '/#belle', label: 'Pepper Belle' },
  { href: '/about', label: 'About' },
  { href: '/#gallery', label: 'Gallery' },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header
      role="banner"
      className="fixed top-0 left-0 right-0 z-40 bg-pepper-black/80 backdrop-blur-md border-b border-zinc-800/50"
    >
      {/* Skip Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-heat-jalapeno focus:text-pepper-black focus:rounded-md"
      >
        Skip to main content
      </a>

      <div className="section-container">
        <nav className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 group"
            aria-label="Let's Pepper - Home"
          >
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 transition-transform group-hover:scale-110">
              <Image
                src="/images/mascots/bell-pepper-logo.png"
                alt=""
                fill
                className="object-contain"
                aria-hidden="true"
              />
            </div>
            <span className="font-display text-xl sm:text-2xl uppercase tracking-tight text-white group-hover:text-heat-jalapeno transition-colors">
              Let&apos;s Pepper
            </span>
          </Link>

          {/* Desktop Navigation */}
          <ul className="hidden md:flex items-center gap-8" role="menubar">
            {navLinks.map((link) => (
              <li key={link.href} role="none">
                <Link
                  href={link.href}
                  role="menuitem"
                  className="font-accent text-sm uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden flex flex-col items-center justify-center w-11 h-11 gap-1.5"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <motion.span
              animate={{ rotate: isOpen ? 45 : 0, y: isOpen ? 6 : 0 }}
              className="w-6 h-0.5 bg-white origin-center"
            />
            <motion.span
              animate={{ opacity: isOpen ? 0 : 1 }}
              className="w-6 h-0.5 bg-white"
            />
            <motion.span
              animate={{ rotate: isOpen ? -45 : 0, y: isOpen ? -6 : 0 }}
              className="w-6 h-0.5 bg-white origin-center"
            />
          </button>
        </nav>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: MOTION.ease.outExpo }}
            className="md:hidden bg-pepper-charcoal border-t border-zinc-800"
          >
            <ul className="section-container py-6 space-y-4" role="menu">
              {navLinks.map((link, index) => (
                <motion.li
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  role="none"
                >
                  <Link
                    href={link.href}
                    role="menuitem"
                    onClick={() => setIsOpen(false)}
                    className="block font-display text-3xl uppercase text-white hover:text-heat-jalapeno transition-colors"
                  >
                    {link.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
