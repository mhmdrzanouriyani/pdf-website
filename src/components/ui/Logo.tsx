import { useId } from 'react'

type LogoProps = {
  size?: number
}

export function Logo({ size = 28 }: LogoProps) {
  const id = useId().replace(/:/g, '')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#111111" />
      <path d="M10 8h8.4a5.1 5.1 0 0 1 0 10.2H13.4V24H10V8Z" fill="white" />
      <path d="M13.4 14.8h4.7a1.7 1.7 0 1 0 0-3.4h-4.7v3.4Z" fill="#111111" />
      <circle cx="23.4" cy="22.6" r="2.15" fill={`url(#${id})`} />
      <defs>
        <linearGradient id={id} x1="21" y1="20.4" x2="25.6" y2="24.8">
          <stop stopColor="#E11D48" />
          <stop offset="0.5" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <Logo size={compact ? 26 : 28} />
      <span className="wordmark-text">PDFLY</span>
    </span>
  )
}
