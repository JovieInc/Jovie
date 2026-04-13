import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import type { FeaturedCreator } from '@/lib/featured-creators';
import { fillToMinimum } from './featured-creators-fallback';
import { HomeAdaptiveProfileStory } from './HomeAdaptiveProfileStory';
import { HomeBaselineComparisonSection } from './HomeBaselineComparisonSection';
import { HomeLiveProofSection } from './HomeLiveProofSection';
import { HomeSecondaryOutcomeModules } from './HomeSecondaryOutcomeModules';
import { HomeSpecChapter } from './HomeSpecChapter';
import { type HomeProofAvailability } from './home-scroll-scenes';

interface HomePageNarrativeProps {
  readonly proofAvailability?: HomeProofAvailability;
  readonly proofSection?: ReactNode;
  readonly proofCreators?: readonly FeaturedCreator[];
}

function FinalCallToAction() {
  return (
    <section
      data-testid='final-cta-section'
      className='border-t border-subtle bg-page py-24 sm:py-28 lg:py-32'
      aria-labelledby='final-cta-headline'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[34rem] text-center'>
          <h2
            id='final-cta-headline'
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-primary-token'
          >
            Claim your profile.
          </h2>
          <p className='mt-4 text-[15px] leading-[1.7] text-secondary-token sm:text-[16px]'>
            One profile for every release.
          </p>

          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Link
              href={APP_ROUTES.SIGNUP}
              data-testid='final-cta-action'
              className='public-action-primary focus-ring-themed'
            >
              Claim your profile
            </Link>
            <Link
              href={APP_ROUTES.ARTIST_PROFILES}
              className='public-action-secondary focus-ring-themed'
            >
              See artist profiles
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function HomePageNarrative({
  proofAvailability = 'hidden',
  proofSection,
  proofCreators,
}: Readonly<HomePageNarrativeProps>) {
  const fallbackProofCreators = fillToMinimum(
    [...(proofCreators ?? [])],
    3
  ).slice(0, 3);
  const resolvedProofSection = proofSection ?? (
    <HomeLiveProofSection creators={fallbackProofCreators} />
  );

  return (
    <>
      <HomeAdaptiveProfileStory proofAvailability={proofAvailability} />
      <HomeBaselineComparisonSection />
      <HomeSecondaryOutcomeModules />
      <HomeSpecChapter />
      {proofAvailability === 'visible' ? resolvedProofSection : null}
      <FinalCallToAction />
    </>
  );
}
