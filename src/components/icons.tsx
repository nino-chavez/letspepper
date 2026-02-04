// Custom SVG icons for Let's Pepper
// Replaces emoji with professional graphics

import { cn } from '@/lib/utils'

interface IconProps {
  className?: string
  size?: number
}

export function GrassrootsIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-bell', className)}
    >
      <path
        d="M12 22V12M12 12C12 12 8 14 6 10C4 6 8 4 12 8C16 4 20 6 18 10C16 14 12 12 12 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 22C7 22 7 18 12 18C17 18 17 22 17 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 22H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function PlayerOwnedIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-poblano', className)}
    >
      <path
        d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function MediaIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-jalapeno', className)}
    >
      <rect
        x="3"
        y="6"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9 3H15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="1" fill="currentColor" />
    </svg>
  )
}

export function CompetitionIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-jalapeno', className)}
    >
      <path
        d="M12 2C12 2 14 6 14 8C14 10 12 12 12 12C12 12 10 10 10 8C10 6 12 2 12 2Z"
        fill="currentColor"
      />
      <path
        d="M12 12C12 12 16 14 18 14C20 14 22 12 22 12C22 12 20 16 18 18C16 20 12 20 12 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 12C12 12 8 14 6 14C4 14 2 12 2 12C2 12 4 16 6 18C8 20 12 20 12 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 20V22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function VolleyballIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2C12 2 8 7 8 12C8 17 12 22 12 22"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 2C12 2 16 7 16 12C16 17 12 22 12 22"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2 12H22"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 7C4 7 9 10 12 10C15 10 20 7 20 7"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 17C4 17 9 14 12 14C15 14 20 17 20 17"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

// Heat level indicator icons
export function HeatMildIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-bell', className)}
    >
      <path
        d="M12 3C12 3 8 5 8 10C8 14 10 16 12 18C14 16 16 14 16 10C16 5 12 3 12 3Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M12 3C12 3 8 5 8 10C8 14 10 16 12 18C14 16 16 14 16 10C16 5 12 3 12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 18V21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HeatMediumIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-poblano', className)}
    >
      <path
        d="M12 2C12 2 7 5 7 11C7 16 10 18 12 20C14 18 17 16 17 11C17 5 12 2 12 2Z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M12 2C12 2 7 5 7 11C7 16 10 18 12 20C14 18 17 16 17 11C17 5 12 2 12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 20V22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10 10C10 10 11 12 12 12C13 12 14 10 14 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HeatHotIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-heat-jalapeno', className)}
    >
      <path
        d="M12 1C12 1 6 5 6 12C6 18 10 20 12 22C14 20 18 18 18 12C18 5 12 1 12 1Z"
        fill="currentColor"
        opacity="0.4"
      />
      <path
        d="M12 1C12 1 6 5 6 12C6 18 10 20 12 22C14 20 18 18 18 12C18 5 12 1 12 1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 9C9 9 10 7 12 7C14 7 15 9 15 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9 13C9 13 10 15 12 15C14 15 15 13 15 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Arrow icons
export function ArrowRightIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 8H13M13 8L9 4M13 8L9 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExternalLinkIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 9V12C12 12.5523 11.5523 13 11 13H4C3.44772 13 3 12.5523 3 12V5C3 4.44772 3.44772 4 4 4H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 3H13V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 3L7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Social icons
export function InstagramIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function CameraIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M23 19C23 20.1046 22.1046 21 21 21H3C1.89543 21 1 20.1046 1 19V8C1 6.89543 1.89543 6 3 6H7L9 3H15L17 6H21C22.1046 6 23 6.89543 23 8V19Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
