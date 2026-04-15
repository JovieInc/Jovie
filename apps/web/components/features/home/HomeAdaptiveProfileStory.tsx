import { Container } from '@/components/site/Container';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { HomeChapter1 } from './HomeChapter1';
import { HomeChapter2 } from './HomeChapter2';
import { HomeHeroCTA } from './HomeHeroCTA';
import { HomeHeroPhoneComposition } from './HomeHeroPhoneComposition';
import { HomeTrustSection } from './HomeTrustSection';
import { HOME_HERO_CONTENT } from './home-page-content';

export function HomeHero() {
  return (
    <section
      className='homepage-hero'
      data-testid='homepage-hero'
      aria-labelledby='home-hero-heading'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[42rem]' />

      <Container size='homepage'>
        <div className='homepage-hero-stacked mx-auto max-w-[1200px]'>
          <div className='homepage-hero-copy'>
            <p className='homepage-hero-eyebrow'>{HOME_HERO_CONTENT.eyebrow}</p>
            <h1
              id='home-hero-heading'
              className='marketing-h1-linear text-primary-token'
            >
              {HOME_HERO_CONTENT.title}
            </h1>
            <p className='marketing-lead-linear mx-auto mt-6 max-w-[34rem] text-secondary-token'>
              {HOME_HERO_CONTENT.body}
            </p>

            <div className='mt-8'>
              <HomeHeroCTA />
            </div>
          </div>

          <HomeHeroPhoneComposition />
        </div>
      </Container>
    </section>
  );
}

export function HomeAdaptiveProfileStory() {
  const showSections = FEATURE_FLAGS.SHOW_HOMEPAGE_SECTIONS;

  return (
    <div data-testid='homepage-shell'>
      <HomeHero />
      {showSections && (
        <>
          <HomeChapter1 />
          <HomeChapter2 />
          <HomeTrustSection />
        </>
      )}
    </div>
  );
}
