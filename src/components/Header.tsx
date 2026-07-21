'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MOTION } from '@/lib/motion'

const navLinks = [
  { href: '/#series', label: 'The Series' },
  { href: '/about', label: 'About' },
  { href: '/standings', label: 'Standings' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/signup', label: 'Sign Up', highlight: true },
]

const communityLinks = [
  { href: '/rankings', label: 'Rankings' },
  { href: '/predictions', label: 'Predictions' },
  { href: '/quiz', label: 'Pepper Quiz' },
  { href: '/bingo', label: 'Pepper Bingo' },
  { href: '/awards', label: 'Pepper Awards' },
  { href: '/hot-takes', label: 'Hot Takes' },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [communityOpen, setCommunityOpen] = useState(false)
  const [mobileCommunityOpen, setMobileCommunityOpen] = useState(false)
  const dropdownRef = useRef<HTMLLIElement>(null)

  // Close desktop dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCommunityOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
                src="/images/mascots/anime/web/bell-pepper-logo-160.webp"
                alt=""
                fill
                unoptimized
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
                  className={cn(
                    'font-accent text-sm uppercase tracking-wider transition-colors',
                    link.highlight
                      ? 'text-heat-jalapeno hover:text-heat-jalapeno/80'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}

            {/* Community Dropdown */}
            <li role="none" ref={dropdownRef} className="relative">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={communityOpen}
                onClick={() => setCommunityOpen(!communityOpen)}
                className={cn(
                  'font-accent text-sm uppercase tracking-wider transition-colors inline-flex items-center gap-1',
                  communityOpen ? 'text-heat-jalapeno' : 'text-zinc-400 hover:text-white'
                )}
              >
                Community
                <svg
                  className={cn('w-3 h-3 transition-transform', communityOpen && 'rotate-180')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <AnimatePresence>
                {communityOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-48 py-2 bg-pepper-charcoal border border-zinc-800 rounded-xl shadow-xl"
                  >
                    {communityLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setCommunityOpen(false)}
                        className="block px-4 py-2 font-accent text-xs uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
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
                    className={cn(
                      'block font-display text-3xl uppercase transition-colors',
                      link.highlight
                        ? 'text-heat-jalapeno hover:text-heat-jalapeno/80'
                        : 'text-white hover:text-heat-jalapeno'
                    )}
                  >
                    {link.label}
                  </Link>
                </motion.li>
              ))}

              {/* Community expandable section */}
              <motion.li
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: navLinks.length * 0.1 }}
                role="none"
              >
                <button
                  type="button"
                  onClick={() => setMobileCommunityOpen(!mobileCommunityOpen)}
                  className={cn(
                    'flex items-center gap-2 font-display text-3xl uppercase transition-colors w-full text-left',
                    mobileCommunityOpen ? 'text-heat-jalapeno' : 'text-white'
                  )}
                >
                  Community
                  <svg
                    className={cn('w-5 h-5 transition-transform', mobileCommunityOpen && 'rotate-180')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence>
                  {mobileCommunityOpen && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3 ml-4 space-y-3 overflow-hidden"
                    >
                      {communityLinks.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            onClick={() => { setIsOpen(false); setMobileCommunityOpen(false) }}
                            className="block font-display text-xl uppercase text-zinc-400 hover:text-heat-jalapeno transition-colors"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
