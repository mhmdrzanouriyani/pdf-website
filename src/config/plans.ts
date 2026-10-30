import { LIMITS, formatBytes } from './limits'

/**
 * Plan definitions shown on the pricing page. Limits come from config so they
 * are not hardcoded across the app. No payment provider is integrated yet:
 * paid plans are displayed as "not available" until BILLING is configured.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === 'true'

export type Plan = {
  id: 'free' | 'pro' | 'team'
  name: string
  price: string
  cadence: string
  blurb: string
  featured: boolean
  features: string[]
  available: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'Everything that runs in your browser, with no account required.',
    featured: false,
    available: true,
    features: [
      "Every PDF tool, no account needed",
      `Files up to ${formatBytes(LIMITS.maxFileBytes)}`,
      `OCR up to ${LIMITS.maxOcrPages} pages per run`,
      'AI Copilot when the server has an AI key',
      'Recent documents kept in your browser',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$12',
    cadence: 'per month (planned)',
    blurb: 'Higher limits and batch processing for heavier work.',
    featured: true,
    available: BILLING_ENABLED,
    features: ['Higher file and page limits', 'Advanced AI tools with higher quotas', 'Batch processing', 'Priority conversions'],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$29',
    cadence: 'per user / month (planned)',
    blurb: 'Shared workflows and admin controls for teams.',
    featured: false,
    available: BILLING_ENABLED,
    features: ['Shared document workflows', 'Team document management', 'Admin controls', 'Usage reporting'],
  },
]
