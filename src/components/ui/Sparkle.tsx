import { useId } from 'react'

type SparkleProps = {
  className?: string
  size?: number
}

export function Sparkle({ className = '', size = 16 }: SparkleProps) {
  const id = useId().replace(/:/g, '')

  return (
    <svg
      className={`sparkle-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 1.2l1.15 3.7 3.85.2-3.05 2.35 1.05 3.7L8 8.95 4.99 11.15l1.06-3.7L3 5.1l3.85-.2L8 1.2Z"
        fill={`url(#${id})`}
      />
      <defs>
        <linearGradient id={id} x1="3" y1="1.2" x2="13" y2="11.2">
          <stop stopColor="#E11D48" />
          <stop offset="0.5" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  )
}
