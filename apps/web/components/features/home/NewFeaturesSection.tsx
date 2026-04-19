'use client';

import { Container } from '@/components/site/Container';

// Feature accent color mapping
const accentColors = {
  blue: 'text-[color:var(--accent-analytics)]',
  purple: 'text-[color:var(--accent-conv)]',
  teal: 'text-[color:var(--accent-pro)]',
  pink: 'text-[color:var(--accent-links)]',
  amber: 'text-[color:var(--accent-beauty)]',
  green: 'text-[color:var(--accent-speed)]',
};

// Feature data with Geist colors
const outcomes = [
  {
    title: 'Higher conversion',
    description: 'App deep links + smart routing.',
  },
  {
    title: 'Owned audience',
    description: 'Know your fans, not just your clicks.',
  },
  {
    title: 'Optimization over time',
    description: 'Automatic A/B testing by persona.',
  },
] as const;

const featureDetails = [
  {
    title: 'Blazing-fast, SEO-ready profiles',
    description:
      'Optimized for speed and search engines to maximize your visibility and conversions.',
    color: 'blue' as keyof typeof accentColors,
  },
  {
    title: 'Conversion-focused analytics',
    description:
      'Track clicks to conversions, referrers, and countries to optimize your profile performance.',
    color: 'green' as keyof typeof accentColors,
  },
  {
    title: 'AI-driven personalization',
    description:
      'Ongoing A/B optimization for higher conversion with location, device, and persona awareness.',
    color: 'purple' as keyof typeof accentColors,
  },
  {
    title: 'Smart deep links',
    description:
      "Intuitive /listen, /tip paths that work with Instagram's multiple links for seamless navigation.",
    color: 'teal' as keyof typeof accentColors,
  },
  {
    title: 'App deep links',
    description:
      'Skip browser and login friction by opening native apps directly for better user experience.',
    color: 'amber' as keyof typeof accentColors,
  },
  {
    title: 'Clean light/dark modes',
    description:
      'Desktop to mobile QR handoff for a seamless experience across all devices and preferences.',
    color: 'pink' as keyof typeof accentColors,
  },
];

export function NewFeaturesSection() {
  return (
    <section
      id='features'
      className='relative py-20 sm:py-24 bg-base overflow-hidden'
    >
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 grid-bg opacity-60' />
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.10),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.20),transparent)]' />
        <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-base to-transparent dark:from-base' />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
      </div>
      <Container>
        {/* Section header */}
        <div className='text-center mb-12 sm:mb-16'>
          <h2 className='text-3xl md:text-4xl font-medium tracking-tight text-primary-token'>
            Sharable profile{' '}
            <span className='text-accent-token'>built to convert</span>
          </h2>
          <p className='mt-4 text-base text-secondary-token max-w-xl mx-auto'>
            A focused profile system designed to turn attention into real fan
            actions.
          </p>
        </div>

        {/* Outcome cards (YC-style: 3 outcomes) */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6'>
          {outcomes.map(outcome => (
            <div
              key={outcome.title}
              className='p-6 rounded-2xl border border-subtle bg-surface-1 hover:bg-surface-2 hover:border-default transition-colors duration-slow'
            >
              <h3 className='text-base font-semibold text-primary-token'>
                {outcome.title}
              </h3>
              <p className='mt-2 text-sm text-secondary-token leading-relaxed'>
                {outcome.description}
              </p>
            </div>
          ))}
        </div>

        {/* Expandable details */}
        <div className='mt-10'>
          <details className='mx-auto max-w-5xl rounded-2xl border border-subtle bg-surface-0 p-6 sm:p-7'>
            <summary className='cursor-pointer select-none text-sm font-medium text-secondary-token hover:text-primary-token focus-ring-themed rounded-md'>
              More details
            </summary>
            <div className='mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {featureDetails.map(feature => (
                <div
                  key={feature.title}
                  className='p-5 rounded-2xl border border-subtle bg-surface-1'
                >
                  <h4
                    className={`text-sm font-semibold ${accentColors[feature.color]} mb-2`}
                  >
                    {feature.title}
                  </h4>
                  <p className='text-sm text-secondary-token leading-relaxed'>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </Container>
    </section>
  );
}
