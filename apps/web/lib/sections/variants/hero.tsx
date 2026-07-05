import { MarketingHero } from '@/components/marketing/MarketingHero';
import type { SectionVariant } from '../registry';

export const HERO_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'marketing-hero',
    category: 'hero',
    label: 'Marketing Hero — canonical',
    description:
      'The one canonical marketing hero: 56px Inter headline, 18px subtitle, dual CTA (primary + ghost) on the canonical button system, distributor logo-bar proof below the copy. No numeric social-proof stats — the logo bar is the only proof element (decision 2026-07-03). Replaces the previous centered/left/split placeholder variants.',
    componentPath: 'components/marketing/MarketingHero.tsx',
    usedIn: ['/', '/pricing'],
    status: 'canonical',
    canonical: true,
    render: () => (
      <MarketingHero
        headline='Drop more music, with less work.'
        subtitle='The AI workspace for artists to plan releases, create assets, pitch playlists, and promote every drop.'
        primaryCta={{ label: 'Claim my workspace', href: '/start' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    ),
  },
];
