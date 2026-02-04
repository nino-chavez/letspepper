'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const socialLinks = [
  {
    name: 'Instagram',
    href: 'https://instagram.com/letspepper',
    icon: (
      <svg
        className="w-5 h-5"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    name: 'Flickday Media',
    href: 'https://flickdaymedia.com',
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
]

const footerLinks = [
  { label: 'The Series', href: '/#series' },
  { label: 'Pepper Belle', href: '/#belle' },
  { label: 'About', href: '/about' },
  { label: 'Standings', href: '/standings' },
  { label: 'FAQ', href: '/faq' },
]

const legalLinks = [
  { label: 'Waiver', href: '/waiver' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      role="contentinfo"
      className="border-t border-zinc-800/50 bg-pepper-charcoal/30"
    >
      <div className="section-container py-12 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-2 group">
              <div className="relative w-10 h-10">
                <Image
                  src="/images/mascots/bell-pepper-logo.png"
                  alt=""
                  fill
                  className="object-contain group-hover:scale-110 transition-transform"
                  aria-hidden="true"
                />
              </div>
              <span className="font-display text-2xl uppercase tracking-tight text-white group-hover:text-heat-jalapeno transition-colors">
                Let&apos;s Pepper
              </span>
            </Link>
            <p className="text-sm text-zinc-500 max-w-xs">
              Underground. Unfiltered. Unapologetically competitive. A
              community-powered circuit of grassroots volleyball tournaments.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-accent text-xs uppercase tracking-wider text-zinc-400 mb-4">
              Quick Links
            </h3>
            <ul className="space-y-3">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-500 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social & Contact */}
          <div>
            <h3 className="font-accent text-xs uppercase tracking-wider text-zinc-400 mb-4">
              Connect
            </h3>
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                  className={cn(
                    'w-11 h-11 flex items-center justify-center rounded-full',
                    'bg-zinc-800/50 border border-zinc-700/50',
                    'text-zinc-400 hover:text-white hover:border-heat-jalapeno/50',
                    'transition-all duration-200'
                  )}
                >
                  {social.icon}
                </a>
              ))}
            </div>

            {/* Tagline */}
            <p className="mt-6 text-sm text-zinc-600 italic">
              &ldquo;No fluff. Just skill, sweat, and fun.&rdquo;
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-zinc-800/50">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
            <p className="text-xs text-zinc-600">
              &copy; {currentYear} Let&apos;s Pepper. All rights reserved.
            </p>
            <p className="text-xs text-zinc-600">
              Media by{' '}
              <a
                href="https://flickdaymedia.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-heat-jalapeno transition-colors"
              >
                Flickday Media
              </a>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-xs">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
