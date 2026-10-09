/**
 * Let's Pepper Motion Token System
 * Underground Athletic Aesthetic
 */

import { useSyncExternalStore } from 'react'

export const MOTION = {
  // Easing curves
  ease: {
    outExpo: [0.16, 1, 0.3, 1] as const,
    outBack: [0.34, 1.56, 0.64, 1] as const,
    inOut: [0.4, 0, 0.2, 1] as const,
  },

  // Duration presets (in seconds)
  duration: {
    fast: 0.15,
    medium: 0.3,
    slow: 0.5,
    stagger: 0.1,
  },

  // Spring presets for Framer Motion
  spring: {
    snappy: { type: 'spring', stiffness: 400, damping: 30 },
    gentle: { type: 'spring', stiffness: 200, damping: 25 },
    bouncy: { type: 'spring', stiffness: 300, damping: 20 },
  },

  // Common animation variants
  variants: {
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },

    slideUp: {
      initial: { opacity: 0, y: 30 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -30 },
    },

    slideInLeft: {
      initial: { opacity: 0, x: -50 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -50 },
    },

    slideInRight: {
      initial: { opacity: 0, x: 50 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 50 },
    },

    scaleIn: {
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.9 },
    },

    // Hero text stagger - each word animates
    heroWord: {
      initial: { opacity: 0, y: 50, rotateX: -20 },
      animate: { opacity: 1, y: 0, rotateX: 0 },
    },

    // Card hover
    cardHover: {
      initial: { scale: 1 },
      hover: { scale: 1.02, y: -4 },
      tap: { scale: 0.98 },
    },
  },

  // Stagger children configuration
  stagger: {
    fast: { staggerChildren: 0.05 },
    medium: { staggerChildren: 0.1 },
    slow: { staggerChildren: 0.15 },
  },

  // Viewport trigger options
  viewport: {
    once: { once: true, margin: '-100px' },
    always: { once: false, margin: '-50px' },
  },
} as const

// Type exports
export type MotionVariant = keyof typeof MOTION.variants
export type MotionSpring = keyof typeof MOTION.spring

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * True when the user prefers reduced motion.
 *
 * The server render and hydration read false; the real value follows on the
 * next render, and later changes to the OS setting are picked up. Reading
 * matchMedia during render instead gave the server and the client different
 * answers, and React 18 does not repair mismatched attributes on hydration:
 * the marquee's pause button kept its server "Pause" label while its state
 * said paused, so a reduced-motion user's first tap did nothing.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  )
}
