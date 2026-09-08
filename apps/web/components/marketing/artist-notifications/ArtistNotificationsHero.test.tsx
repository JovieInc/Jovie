import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';
import storyMeta, { Hero } from './ArtistNotificationsHero.stories';

describe('ArtistNotificationsHero', () => {
  it('renders the canonical notification hero with bounded headline and CTA', () => {
    render(<ArtistNotificationsHero hero={ARTIST_NOTIFICATIONS_COPY.hero} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Reach Every Fan. Automatically.',
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('link', {
        name: ARTIST_NOTIFICATIONS_COPY.hero.primaryCtaLabel,
      })
    ).toHaveAttribute('href', ARTIST_NOTIFICATIONS_COPY.hero.primaryCtaHref);

    for (const card of ARTIST_NOTIFICATIONS_COPY.hero.floatingCards) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    }
  });

  it('keeps the adjacent Storybook receipt bound to the production fixture', () => {
    expect(storyMeta.component).toBe(ArtistNotificationsHero);
    expect(Hero.args?.hero).toBe(ARTIST_NOTIFICATIONS_COPY.hero);
  });
});
