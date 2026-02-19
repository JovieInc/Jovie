'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { HeroSection } from '@/components/organisms/HeroSection';

export function LinkInBioHero() {
  return (
    <HeroSection
      headline='Jovie: Built to Convert Not to Decorate'
      highlightText='Convert'
      gradientVariant='purple-cyan'
      subtitle="Your fans don't care about button colors—they care about your music. Jovie's AI tests every word, layout, and CTA behind the scenes to make sure more fans click, listen, and buy."
      icon='🚀'
      supportingText={
        <div className='flex items-center gap-2 text-tertiary-token'>
          <svg
            className='w-5 h-5 text-success'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            aria-hidden='true'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M5 13l4 4L19 7'
            />
          </svg>
          <span className='text-sm'>
            You focus on creating. We focus on converting.
          </span>
        </div>
      }
      trustIndicators={
        <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
          Trusted by 10,000+ artists worldwide
        </p>
      }
      showBackgroundEffects={false}
    >
      <div className='flex flex-col sm:flex-row gap-6 justify-center items-center'>
        <Button
          asChild
          size='lg'
          variant='primary'
          className='text-lg px-8 py-4 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25 dark:hover:shadow-indigo-400/25'
        >
          <Link href='/onboarding'>Create Your Profile</Link>
        </Button>

        <Button
          asChild
          size='lg'
          variant='secondary'
          className='text-lg px-8 py-4 transition-all duration-300 hover:scale-105'
        >
          <Link href='/pricing'>View Pricing</Link>
        </Button>
      </div>
    </HeroSection>
  );
}
