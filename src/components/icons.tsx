// Custom SVG icons for Let's Pepper.
//
// One icon, deliberately. This file held twelve; eleven had no reference
// anywhere in the repo. Four were the ethos tiles, deleted with the tiles
// themselves (DIRECTION.md#ethos-tiles). The other seven — volleyball, three
// heat-level indicators, arrow, external-link, instagram — were already dead
// before that change and are recoverable from git if a surface ever wants them.

interface IconProps {
  className?: string
  size?: number
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
