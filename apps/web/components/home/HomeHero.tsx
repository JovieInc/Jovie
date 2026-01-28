import type { ReactNode } from 'react';
import { HeroSection } from '@/components/organisms/HeroSection';
import { HomeHeroContent } from './HomeHeroContent';

export function HomeHero({ subtitle }: Readonly<{ subtitle?: ReactNode }>) {
  const defaultSubtitle = subtitle ?? 'Your Jovie profile, ready in seconds.';
  const trustIndicators = (
    <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
      Trusted by 10,000+ artists worldwide
    </p>
  );

  return (
    <HeroSection
      headline='Request Early Access'
      highlightText='handle'
      gradientVariant='primary'
      subtitle={defaultSubtitle}
      supportingText='Go live in 60 seconds • Free forever'
      trustIndicators={trustIndicators}
    >
      <HomeHeroContent />
    </HeroSection>
  );
}
