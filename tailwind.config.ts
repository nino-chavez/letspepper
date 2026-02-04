import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pepper: {
          black: '#0a0a0a',
          charcoal: '#1a1a1a',
          dark: '#141414',
        },
        heat: {
          bell: '#4ade80',
          'bell-glow': '#22c55e',
          poblano: '#facc15',
          'poblano-glow': '#eab308',
          jalapeno: '#f97316',
          'jalapeno-glow': '#ea580c',
          habanero: '#ef4444',
        },
        belle: {
          primary: '#f472b6',
          glow: '#ec4899',
        },
      },
      fontFamily: {
        display: ['Bebas Neue', 'Impact', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        accent: ['Space Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'hero': 'clamp(3.5rem, 15vw, 10rem)',
        'display': 'clamp(2rem, 8vw, 5rem)',
        'heading': 'clamp(1.5rem, 4vw, 2.5rem)',
      },
      lineHeight: {
        'tight': '0.85',
        'display': '0.95',
      },
      animation: {
        'grain': 'grain 8s steps(10) infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
        'slide-up': 'slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fade-in 0.6s ease-out forwards',
      },
      keyframes: {
        grain: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-5%, -10%)' },
          '20%': { transform: 'translate(-15%, 5%)' },
          '30%': { transform: 'translate(7%, -25%)' },
          '40%': { transform: 'translate(-5%, 25%)' },
          '50%': { transform: 'translate(-15%, 10%)' },
          '60%': { transform: 'translate(15%, 0%)' },
          '70%': { transform: 'translate(0%, 15%)' },
          '80%': { transform: 'translate(3%, 35%)' },
          '90%': { transform: 'translate(-10%, 10%)' },
        },
        'glow-pulse': {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'noise': "url('/noise.svg')",
      },
    },
  },
  plugins: [],
}

export default config
