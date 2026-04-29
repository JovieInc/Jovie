import Link from 'next/link';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import type { SectionVariant } from '../registry';

/** Demo content rendered inside MarketingHero so the layout primitive renders something. */
function HeroDemoContent() {
  return (
    <>
      <div className='text-2xs font-medium tracking-[0.06em] text-[rgb(97,153,246)]'>
        Meet Jovie
      </div>
      <h1 className='font-display mt-3 text-balance text-[clamp(2.5rem,5vw,5rem)] font-[600] leading-[1.05] tracking-[-0.045em] text-primary-token'>
        Drop more music, with less work.
      </h1>
      <p className='mt-5 max-w-[42rem] text-[18px] leading-[1.45] text-[rgba(234,234,255,0.5)]'>
        The AI workspace for artists to plan releases, create assets, pitch
        playlists, and promote every drop.
      </p>
      <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
        <Link
          href='/onboarding'
          className='inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/90'
        >
          Claim my workspace
        </Link>
        <Link
          href='/pricing'
          className='inline-flex h-10 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/5'
        >
          See pricing
        </Link>
      </div>
    </>
  );
}

function SplitDemoContent() {
  return (
    <>
      <div>
        <div className='text-2xs font-medium tracking-[0.06em] text-[rgb(97,153,246)]'>
          Artist profiles
        </div>
        <h1 className='font-display mt-3 text-balance text-[clamp(2rem,4vw,3.5rem)] font-[600] leading-[1.1] tracking-[-0.035em] text-primary-token'>
          One link. Every drop. Real attribution.
        </h1>
        <p className='mt-5 text-[17px] leading-[1.5] text-secondary-token'>
          Replace the bio-link tax with a profile that auto-updates from your
          DSP catalog and tracks who actually clicked through to streams.
        </p>
        <div className='mt-7'>
          <Link
            href='/onboarding'
            className='inline-flex h-10 items-center rounded-full bg-primary-token px-5 text-sm font-semibold text-on-primary'
          >
            Claim your handle
          </Link>
        </div>
      </div>
      <div className='aspect-[4/3] w-full rounded-2xl border border-subtle bg-surface-1' />
    </>
  );
}

export const HERO_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'marketing-hero-centered',
    category: 'hero',
    label: 'Marketing Hero — centered',
    description:
      'Single-column, text centered. Standard landing-page hero shape.',
    componentPath: 'components/marketing/MarketingHero.tsx',
    usedIn: ['/changelog', '/blog', '/support', '/'],
    status: 'canonical',
    canonical: true,
    render: () => (
      <MarketingHero variant='centered'>
        <HeroDemoContent />
      </MarketingHero>
    ),
  },
  {
    id: 'marketing-hero-left',
    category: 'hero',
    label: 'Marketing Hero — left-aligned',
    description: 'Single column, text left. Used for content-heavy heroes.',
    componentPath: 'components/marketing/MarketingHero.tsx',
    usedIn: ['/blog/[slug]'],
    status: 'canonical',
    render: () => (
      <MarketingHero variant='left'>
        <HeroDemoContent />
      </MarketingHero>
    ),
  },
  {
    id: 'marketing-hero-split',
    category: 'hero',
    label: 'Marketing Hero — split (text + media)',
    description:
      'Two-column on md+: text left, media right. Product-led heroes.',
    componentPath: 'components/marketing/MarketingHero.tsx',
    usedIn: ['/artist-profile'],
    status: 'canonical',
    render: () => (
      <MarketingHero variant='split'>
        <SplitDemoContent />
      </MarketingHero>
    ),
  },
  {
    id: 'organism-hero-section',
    category: 'hero',
    label: 'HeroSection (organism — pricing/launch)',
    description:
      'Older hero shape with a gradient-highlight prop. Folded into MarketingHero in PR 3.',
    componentPath: 'components/organisms/HeroSection.tsx',
    usedIn: ['/pricing', '/launch'],
    status: 'consolidate',
    mergeInto: 'marketing-hero-centered',
    render: () => (
      <MarketingHero variant='centered'>
        <HeroDemoContent />
      </MarketingHero>
    ),
  },
];
