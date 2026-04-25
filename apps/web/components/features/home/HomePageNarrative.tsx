import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import type { FeaturedCreator } from '@/lib/featured-creators';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { fillToMinimum } from './featured-creators-fallback';
import { HomeAdaptiveProfileStory } from './HomeAdaptiveProfileStory';
import { HomeAutoNotifySection } from './HomeAutoNotifySection';
import { HomeEngageBentoSection } from './HomeEngageBentoSection';
import { HomeFanRelationshipSection } from './HomeFanRelationshipSection';
import { HomeLiveProofSection } from './HomeLiveProofSection';
import {
  HOMEPAGE_FINAL_CTA_CONTENT,
  type HomeFinalCtaContent,
  type HomeProofAvailability,
} from './home-page-content';

interface HomePageNarrativeProps {
  readonly proofAvailability?: HomeProofAvailability;
  readonly proofSection?: ReactNode;
  readonly proofCreators?: readonly FeaturedCreator[];
}

export interface FinalCallToActionProps {
  readonly content?: HomeFinalCtaContent;
}

export function FinalCallToAction({
  content = HOMEPAGE_FINAL_CTA_CONTENT,
}: FinalCallToActionProps) {
  return (
    <section
      data-testid='final-cta-section'
      className='homepage-final-cta-section'
      aria-labelledby='final-cta-headline'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px] text-center'>
          <h2
            id='final-cta-headline'
            data-testid='final-cta-headline'
            className='marketing-h1-linear mx-auto text-primary-token'
          >
            {content.title}
          </h2>
          <p className='homepage-final-cta-body'>{content.body}</p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Link
              href={APP_ROUTES.SIGNUP}
              data-testid='final-cta-action'
              className='homepage-pill-primary focus-ring-themed'
            >
              {content.primaryCtaLabel}
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

  const showSections = FEATURE_FLAGS.SHOW_HOMEPAGE_SECTIONS;

  return (
    <>
      <HomeAdaptiveProfileStory />
      {showSections && (
        <>
          <HomeEngageBentoSection />
          <HomeAutoNotifySection />
          <HomeFanRelationshipSection />
          {proofAvailability === 'visible' ? resolvedProofSection : null}
          <FinalCallToAction />
        </>
      )}
    </>
  );
}
