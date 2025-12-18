'use client';

import { Container } from '@/components/site/Container';

// Geist Design System colors
const geistColors = {
  blue: {
    icon: 'text-[#0070F3]',
    bg: 'bg-[#0070F3]/10',
    border: 'border-[#0070F3]/20',
  },
  purple: {
    icon: 'text-[#7928CA]',
    bg: 'bg-[#7928CA]/10',
    border: 'border-[#7928CA]/20',
  },
  teal: {
    icon: 'text-[#00A8A8]',
    bg: 'bg-[#00A8A8]/10',
    border: 'border-[#00A8A8]/20',
  },
  pink: {
    icon: 'text-[#FF0080]',
    bg: 'bg-[#FF0080]/10',
    border: 'border-[#FF0080]/20',
  },
  amber: {
    icon: 'text-[#F5A623]',
    bg: 'bg-[#F5A623]/10',
    border: 'border-[#F5A623]/20',
  },
  green: {
    icon: 'text-[#00C853]',
    bg: 'bg-[#00C853]/10',
    border: 'border-[#00C853]/20',
  },
};

// Feature data with Geist colors
const features = [
  {
    title: 'Blazing-fast, SEO-ready profiles',
    description:
      'Optimized for speed and search engines to maximize your visibility and conversions.',
    color: 'blue' as keyof typeof geistColors,
    icon: (
      <svg
        className='w-5 h-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth={2}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M13 10V3L4 14h7v7l9-11h-7z'
        />
      </svg>
    ),
  },
  {
    title: 'AI-driven personalization',
    description:
      'Ongoing A/B optimization for higher conversion with location, device, and persona awareness.',
    color: 'purple' as keyof typeof geistColors,
    icon: (
      <svg
        className='w-5 h-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth={2}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
        />
      </svg>
    ),
  },
  {
    title: 'Smart deep links',
    description:
      "Intuitive /listen, /tip paths that work with Instagram's multiple links for seamless navigation.",
    color: 'teal' as keyof typeof geistColors,
    icon: (
      <svg
        className='w-5 h-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth={2}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
        />
      </svg>
    ),
  },
  {
    title: 'Clean light/dark modes',
    description:
      'Desktop to mobile QR handoff for a seamless experience across all devices and preferences.',
    color: 'pink' as keyof typeof geistColors,
    icon: (
      <svg
        className='w-5 h-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth={2}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
        />
      </svg>
    ),
  },
  {
    title: 'App deep links',
    description:
      'Skip browser and login friction by opening native apps directly for better user experience.',
    color: 'amber' as keyof typeof geistColors,
    icon: (
      <svg
        className='w-5 h-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth={2}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z'
        />
      </svg>
    ),
  },
  {
    title: 'Conversion-focused analytics',
    description:
      'Track clicks to conversions, referrers, and countries to optimize your profile performance.',
    color: 'green' as keyof typeof geistColors,
    icon: (
      <svg
        className='w-5 h-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth={2}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
        />
      </svg>
    ),
  },
];

export function NewFeaturesSection() {
  return (
    <section id='features' className='py-20 sm:py-28 bg-white dark:bg-[#0D0E12]'>
      <Container>
        {/* Section header */}
        <div className='text-center mb-14 sm:mb-16'>
          <p className='text-xs font-medium tracking-wide uppercase text-neutral-500 dark:text-neutral-400'>
            Features
          </p>
          <h2 className='mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-neutral-900 dark:text-white'>
            Included forever.
          </h2>
          <p className='mt-4 text-base sm:text-lg text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto'>
            Everything you need to convert attention into fans.
          </p>
        </div>

        {/* Feature grid - Linear style cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {features.map((feature, index) => {
            const colorClasses = geistColors[feature.color];
            return (
              <div
                key={index}
                className='group relative p-6 sm:p-7 rounded-2xl border border-neutral-200/60 dark:border-white/10 bg-white/60 dark:bg-white/3 hover:border-neutral-300/70 dark:hover:border-white/15 hover:bg-neutral-50/40 dark:hover:bg-white/5 hover:shadow-sm hover:shadow-neutral-900/5 dark:hover:shadow-black/30 transition-all duration-200'
              >
                {/* Icon with Geist color */}
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${colorClasses.bg} ${colorClasses.border} border mb-4`}
                >
                  <span className={colorClasses.icon}>{feature.icon}</span>
                </div>

                {/* Title */}
                <h3 className='text-base font-semibold text-neutral-900 dark:text-white mb-2'>
                  {feature.title}
                </h3>

                {/* Description */}
                <p className='text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed'>
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
