import { Button } from '@jovie/ui';
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { ArtistNotificationFloatingCardView } from '@/components/marketing/MarketingStoryPrimitives';
import type { ArtistNotificationsLandingCopy } from '@/data/artistNotificationsCopy';

interface ArtistNotificationsHeroProps {
  readonly hero: ArtistNotificationsLandingCopy['hero'];
}

const CARD_POSITIONS: Record<
  ArtistNotificationsLandingCopy['hero']['floatingCards'][number]['kind'],
  string
> = {
  capture: 'system-b-artist-notifications-card-capture',
  subscribe: 'system-b-artist-notifications-card-subscribe',
  email: 'system-b-artist-notifications-card-email',
  click: 'system-b-artist-notifications-card-click',
  outcome: 'system-b-artist-notifications-card-outcome',
};

export function ArtistNotificationsHero({
  hero,
}: Readonly<ArtistNotificationsHeroProps>) {
  return (
    <section className='relative overflow-hidden pb-20 pt-14 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24'>
      <div
        aria-hidden='true'
        className='system-b-artist-notifications-hero-backdrop'
      />
      <MarketingContainer width='landing' className='relative'>
        <div className='system-b-artist-notifications-hero-grid'>
          <div className='system-b-artist-notifications-hero-copy'>
            <h1 className='system-b-artist-notifications-hero-title'>
              {hero.headlineLines?.length
                ? hero.headlineLines.map(line =>
                    line ? (
                      <span
                        key={line}
                        className='system-b-artist-notifications-hero-title-line'
                      >
                        {line}
                      </span>
                    ) : null
                  )
                : hero.headline}
            </h1>
            {hero.subhead ? (
              <p className='system-b-artist-notifications-hero-subhead'>
                {hero.subhead}
              </p>
            ) : null}

            <div className='mt-8'>
              <Button
                asChild
                variant='whitePill'
                className='system-b-artist-notifications-hero-cta'
              >
                <Link href={hero.primaryCtaHref}>{hero.primaryCtaLabel}</Link>
              </Button>
            </div>
          </div>

          <div className='system-b-artist-notifications-card-stage'>
            {hero.floatingCards.map(card => (
              <div
                key={card.id}
                className={`system-b-artist-notifications-card-position ${CARD_POSITIONS[card.kind]}`}
              >
                <ArtistNotificationFloatingCardView card={card} />
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
