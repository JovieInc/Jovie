import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { segmentedAccessibleName } from '@/tests/utils/accessible-name';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';
import storyMeta, { Hero } from './ArtistNotificationsHero.stories';

describe('ArtistNotificationsHero', () => {
  it('renders the canonical notification hero with bounded headline and CTA', () => {
    render(<ArtistNotificationsHero hero={ARTIST_NOTIFICATIONS_COPY.hero} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: segmentedAccessibleName('Reach Every Fan.', 'Automatically.'),
      })
    ).not.toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('link', {
        name: ARTIST_NOTIFICATIONS_COPY.hero.primaryCtaLabel,
      })
    ).toHaveAttribute('href', ARTIST_NOTIFICATIONS_COPY.hero.primaryCtaHref);

    for (const card of ARTIST_NOTIFICATIONS_COPY.hero.floatingCards) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    }
  });

  it('docks under the header and renders the low-opacity dark-underlay hero image', () => {
    const { container } = render(
      <ArtistNotificationsHero hero={ARTIST_NOTIFICATIONS_COPY.hero} />
    );

    expect(container.querySelector('section')).toHaveClass(
      'marketing-hero-dock'
    );

    const heroImage = container.querySelector('img[alt=""]');
    expect(heroImage?.getAttribute('src')).toContain(
      encodeURIComponent('/images/hero/artist-notifications.webp')
    );
    expect(heroImage).toHaveClass('opacity-30');
  });

  it('keeps the adjacent Storybook receipt bound to the production fixture', () => {
    expect(storyMeta.component).toBe(ArtistNotificationsHero);
    expect(Hero.args?.hero).toBe(ARTIST_NOTIFICATIONS_COPY.hero);
  });
});
