import { Container } from '@/components/site/Container';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { cn } from '@/lib/utils';
import { HomeHeroCTA } from './HomeHeroCTA';
import { HomeHeroPhoneComposition } from './HomeHeroPhoneComposition';
import { HomeTrustSection } from './HomeTrustSection';
import { HOME_HERO_CONTENT } from './home-page-content';

interface HomeHeroProps {
  readonly layout?: 'stacked' | 'f';
  readonly showPhoneComposition?: boolean;
  readonly variant?: 'default' | 'artist-profile';
}

export function HomeHero({
  layout = 'stacked',
  showPhoneComposition = true,
  variant = 'default',
}: Readonly<HomeHeroProps>) {
  const eyebrow =
    variant === 'artist-profile' ? null : HOME_HERO_CONTENT.eyebrow;

  return (
    <section
      className={cn(
        'homepage-hero',
        layout === 'f' && 'homepage-hero--f',
        variant === 'artist-profile' && 'homepage-hero--artist-profile'
      )}
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
            {eyebrow ? (
              <p className='homepage-hero-eyebrow'>{eyebrow}</p>
            ) : null}
            <h1
              id='home-hero-heading'
              className={cn(
                'marketing-h1-linear text-primary-token',
                variant === 'artist-profile' &&
                  'homepage-hero-artist-profile-title'
              )}
            >
              {HOME_HERO_CONTENT.title}
            </h1>
            <p
              className={cn(
                'marketing-lead-linear mx-auto mt-6 max-w-[34rem] text-secondary-token',
                variant === 'artist-profile' &&
                  'homepage-hero-artist-profile-body'
              )}
            >
              {HOME_HERO_CONTENT.body}
            </p>

            <div className={cn(variant === 'artist-profile' ? 'mt-9' : 'mt-8')}>
              <HomeHeroCTA />
            </div>
          </div>

          {showPhoneComposition ? <HomeHeroPhoneComposition /> : null}
        </div>
      </Container>
    </section>
  );
}

export function HomeAdaptiveProfileStory() {
  const showLogoBar = FEATURE_FLAGS.SHOW_LOGO_BAR;

  return (
    <div data-testid='homepage-shell'>
      <HomeHero />
      {showLogoBar ? <HomeTrustSection /> : null}
    </div>
  );
}
