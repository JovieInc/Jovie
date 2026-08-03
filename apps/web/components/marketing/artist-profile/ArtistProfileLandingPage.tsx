// @coverage-via apps/web/tests/unit/app/artist-profiles-page.test.tsx
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import { ArtistProfileHero } from './ArtistProfileHero';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import { ArtistProfileReleaseCycleGallery } from './ArtistProfileSocialProof';

const LIVE_PROFILE = getMarketingExportImage('tim-white-profile-live-mobile');

const DEFAULT_CALLOUTS = [
  {
    id: 'identity',
    title: 'Your Identity',
    body: 'Artwork, artist name, and verified destinations stay unmistakably yours.',
  },
  {
    id: 'release',
    title: 'What Is Current',
    body: 'The newest release leads without asking fans to search for it.',
  },
  {
    id: 'action',
    title: 'The Right Next Move',
    body: 'Get release alerts, listen, find tickets, or support—the action follows the moment.',
  },
  {
    id: 'navigation',
    title: 'Everything Else',
    body: 'Music-native navigation keeps the rest close without competing for attention.',
  },
] as const;

function ArtistProfileAnnotatedTruth({
  specWall,
}: Readonly<{ specWall: ArtistProfileLandingCopy['specWall'] }>) {
  const callouts = specWall.callouts ?? DEFAULT_CALLOUTS;

  return (
    <ArtistProfileSectionShell className='ap-annotated-truth bg-surface-0'>
      <div className='mx-auto max-w-public-content'>
        <ArtistProfileSectionHeader
          align='left'
          headline={specWall.headline}
          body={specWall.subhead}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />

        <div className='ap-annotated-truth__composition mt-12 grid items-center gap-10 border-y border-subtle py-8 lg:grid-cols-[minmax(28rem,1.15fr)_minmax(20rem,0.85fr)] lg:gap-16 lg:py-12'>
          <div className='ap-annotated-truth__product-stage relative flex min-h-144 items-center justify-center'>
            <ArtistProfilePhoneFrame className='ap-annotated-truth__phone'>
              <Image
                fill
                src={LIVE_PROFILE.publicUrl}
                alt="Tim White's live Jovie artist profile."
                className='object-cover object-top'
                sizes='(min-width: 1024px) 21rem, 18rem'
              />
            </ArtistProfilePhoneFrame>
            {callouts.map((callout, index) => (
              <span
                key={callout.id}
                aria-hidden='true'
                className={`ap-annotated-truth__marker ap-annotated-truth__marker--${callout.id}`}
              >
                {index + 1}
              </span>
            ))}
          </div>

          <ol className='ap-annotated-truth__callouts border-t border-subtle'>
            {callouts.map((callout, index) => (
              <li
                key={callout.id}
                data-testid='artist-profile-truth-tile'
                className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-subtle py-5'
              >
                <span className='font-mono text-3xs text-tertiary-token'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className='text-sm font-semibold text-primary-token'>
                    {callout.title}
                  </h3>
                  <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                    {callout.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {specWall.relatedHeadline && specWall.relatedFeatures ? (
          <div className='mt-14 lg:mt-18'>
            <h3 className='max-w-3xl text-balance text-xl font-semibold tracking-tight text-primary-token sm:text-2xl'>
              {specWall.relatedHeadline}
            </h3>
            <div className='mt-6 grid border-t border-subtle md:grid-cols-2'>
              {specWall.relatedFeatures.map((feature, index) => {
                const content = (
                  <>
                    <div className='flex items-start justify-between gap-4'>
                      <h4 className='text-sm font-semibold text-primary-token'>
                        {feature.title}
                      </h4>
                      {feature.href ? (
                        <ArrowUpRight
                          className='h-4 w-4 shrink-0 text-tertiary-token'
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                      {feature.body}
                    </p>
                    {feature.ctaLabel ? (
                      <span className='mt-4 block text-xs font-medium text-primary-token'>
                        {feature.ctaLabel}
                      </span>
                    ) : null}
                  </>
                );
                const className = `min-h-40 border-b border-subtle py-6 md:px-6 ${
                  index % 2 === 0 ? 'md:border-r md:pl-0' : 'md:pr-0'
                }`;

                return feature.href ? (
                  <Link
                    key={feature.id}
                    href={feature.href}
                    data-testid='artist-profile-related-feature'
                    className={`${className} transition-colors duration-fast hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus/50`}
                  >
                    {content}
                  </Link>
                ) : (
                  <article
                    key={feature.id}
                    data-testid='artist-profile-related-feature'
                    className={className}
                  >
                    {content}
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </ArtistProfileSectionShell>
  );
}

interface ArtistProfileLandingPageProps {
  readonly copy: ArtistProfileLandingCopy;
  readonly flags: ArtistProfileSectionFlags;
}

export function ArtistProfileLandingPage({
  copy,
  flags,
}: Readonly<ArtistProfileLandingPageProps>) {
  if (!flags.FULL_PAGE) {
    return (
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <ArtistProfileHero hero={copy.hero} />
      </div>
    );
  }

  return (
    <>
      <ArtistProfileHeroAdaptiveIntro
        hero={copy.hero}
        adaptive={copy.adaptive}
      />
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.outcomes}>
        <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.capture}>
        <ArtistProfileCaptureSection
          capture={copy.capture}
          id='capture-every-fan'
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.opinionated}>
        <ArtistProfileOpinionatedSection opinionated={copy.opinionated} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.specWall}>
        <ArtistProfileAnnotatedTruth specWall={copy.specWall} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.howItWorks}>
        <ArtistProfileHowItWorks howItWorks={copy.howItWorks} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.releaseCycle}>
        <ArtistProfileReleaseCycleGallery releaseCycle={copy.releaseCycle} />
      </div>
      {flags.FAQ ? (
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.faq}>
          <ArtistProfileFaq faq={copy.faq} />
        </div>
      ) : null}
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.finalCta}>
        <ArtistProfileFinalCta finalCta={copy.finalCta} />
      </div>
    </>
  );
}
