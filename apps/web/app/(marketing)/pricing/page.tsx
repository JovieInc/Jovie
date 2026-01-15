'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export default function PricingPage() {
  const freeFeatures = [
    'Blazing-fast profiles, SEO-optimized',
    'AI-driven personalization',
    'Smart deep links (/listen, /tip, etc.)',
    'Clean dark/light mode',
    'App deep links (no browser friction)',
    'Conversion-focused analytics',
    'Unique Jovie handle (yourname)',
  ];

  const proFeatures = [
    'Everything in Free',
    'No Jovie branding - Your profile, your brand',
    'Capture any identifier - Email, phone, or Spotify',
    "Remember your fans across visits - See who's new, who's back",
    'Segment new vs. returning listeners - Understand your audience',
    "See what's working - Simple reports, clear insights",
  ];

  const growthFeatures = [
    'Everything in Pro',
    'Automated follow-ups - Playlist adds, drop reminders',
    'Test what converts - A/B headlines and offers',
    'Retarget your fans on Meta - Stay top of mind',
    "Smart suggestions - We'll tell you what to do next",
  ];

  return (
    <div className='min-h-screen bg-white dark:bg-[#0a0a0b]'>
      <Container size='lg'>
        <div className='py-20 sm:py-28'>
          {/* Header */}
          <div className='text-center mb-20'>
            <h1
              className='text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-neutral-900 dark:text-white leading-[1.1]'
              style={{ fontSynthesisWeight: 'none' }}
            >
              Find a plan to grow your audience.
            </h1>
            <p className='mt-6 text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto'>
              Jovie supports artists of all sizes, with pricing that scales.
            </p>
          </div>

          {/* Three-tier pricing grid */}
          <div className='max-w-6xl mx-auto'>
            <div className='grid md:grid-cols-3 gap-6'>
              {/* Free Tier */}
              <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 flex flex-col'>
                <div className='mb-4'>
                  <span className='text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400'>
                    Free
                  </span>
                </div>
                <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-4'>
                  Everything you need to start.
                </p>
                <div className='flex items-baseline mb-6'>
                  <span
                    className='text-4xl font-semibold text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    $0
                  </span>
                  <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                    forever
                  </span>
                </div>
                <Link
                  href='/waitlist?plan=free'
                  className='block w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-medium text-center leading-10 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors mb-6'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Join waitlist →
                </Link>
                <ul className='space-y-3 grow'>
                  {freeFeatures.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-400 dark:text-neutral-500 mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pro Tier */}
              <div className='rounded-xl border-2 border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/50 p-8 flex flex-col relative'>
                <div className='mb-4'>
                  <span className='text-xs font-medium uppercase tracking-wide text-neutral-900 dark:text-white'>
                    Pro
                  </span>
                </div>
                <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-4'>
                  Your identity. Your data.
                </p>
                <div className='flex items-baseline mb-6'>
                  <span
                    className='text-4xl font-semibold text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    $39
                  </span>
                  <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                    /month
                  </span>
                </div>
                <Link
                  href='/waitlist?plan=pro'
                  className='block w-full h-10 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium text-center leading-10 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors mb-6'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Join waitlist →
                </Link>
                <ul className='space-y-3 grow'>
                  {proFeatures.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-900 dark:text-white mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-700 dark:text-neutral-300'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Growth Tier */}
              <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 flex flex-col'>
                <div className='mb-4'>
                  <span className='text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400'>
                    Growth
                  </span>
                </div>
                <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-4'>
                  Automate. Retarget. Scale.
                </p>
                <div className='flex items-baseline mb-6'>
                  <span
                    className='text-4xl font-semibold text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    $99
                  </span>
                  <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                    /month
                  </span>
                </div>
                <Link
                  href='/waitlist?plan=growth'
                  className='block w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-medium text-center leading-10 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors mb-6'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Join waitlist →
                </Link>
                <ul className='space-y-3 grow'>
                  {growthFeatures.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-400 dark:text-neutral-500 mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Optional Add-on - Full Width */}
            <div className='group mt-6 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-linear-to-b from-white to-neutral-50/30 dark:from-neutral-900 dark:to-neutral-900/50 p-6 transition-all hover:border-neutral-300/80 dark:hover:border-neutral-700/80 hover:shadow-sm'>
              <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6'>
                <div className='flex-1'>
                  <div className='inline-flex items-center gap-2 mb-3'>
                    <span className='text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500'>
                      Optional Add-on
                    </span>
                    <span className='h-px flex-1 bg-linear-to-r from-neutral-200 to-transparent dark:from-neutral-800'></span>
                  </div>
                  <h3 className='text-base font-semibold text-neutral-900 dark:text-white mb-2'>
                    Remove Jovie branding
                  </h3>
                  <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-3'>
                    Give your fans a fully custom, professional experience
                    without any third-party branding.
                  </p>
                  <div className='flex items-baseline gap-2'>
                    <span className='text-2xl font-semibold text-neutral-900 dark:text-white'>
                      $5
                    </span>
                    <span className='text-sm text-neutral-500 dark:text-neutral-400'>
                      /mo
                    </span>
                    <span className='text-sm text-neutral-400 dark:text-neutral-500'>
                      or
                    </span>
                    <span className='text-lg font-medium text-neutral-700 dark:text-neutral-300'>
                      $50
                    </span>
                    <span className='text-sm text-neutral-500 dark:text-neutral-400'>
                      /year
                    </span>
                  </div>
                </div>
                <Link
                  href='/waitlist?plan=branding'
                  className='inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all shadow-sm hover:shadow group-hover:scale-[1.02]'
                >
                  <span>Learn more</span>
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                    aria-hidden='true'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M9 5l7 7-7 7'
                    />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Footer note */}
            <p className='mt-8 text-center text-sm text-neutral-400 dark:text-neutral-500'>
              30-day money-back guarantee. Cancel anytime.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
