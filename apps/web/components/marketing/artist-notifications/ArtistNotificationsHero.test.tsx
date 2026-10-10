import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { segmentedAccessibleName } from '@/tests/utils/accessible-name';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';
import storyMeta, { Hero } from './ArtistNotificationsHero.stories';

vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & { prefetch?: boolean }
    >(function TestLink({ prefetch, ...props }, ref) {
      return <a {...props} ref={ref} data-test-prefetch={String(prefetch)} />;
    }),
  };
});

describe('ArtistNotificationsHero', () => {
  it('waits for notification trial intent while retaining query destinations and public prefetch', () => {
    const hero = ARTIST_NOTIFICATIONS_COPY.hero;
    const view = render(<ArtistNotificationsHero hero={hero} />);
    const trial = screen.getByRole('link', { name: hero.primaryCtaLabel });
    expect(trial).toHaveAttribute('href', '/signup?plan=pro');
    expect(trial).toHaveAttribute('data-test-prefetch', 'false');
    fireEvent.focus(trial);
    fireEvent.mouseEnter(trial);
    expect(trial).toHaveAttribute('href', '/signup?plan=pro');
    expect(trial).toHaveAttribute('data-test-prefetch', 'false');

    view.rerender(
      <ArtistNotificationsHero
        hero={{ ...hero, primaryCtaHref: '/pricing?from=notifications' }}
      />
    );
    const publicAction = screen.getByRole('link', {
      name: hero.primaryCtaLabel,
    });
    expect(publicAction).toHaveAttribute('href', '/pricing?from=notifications');
    expect(publicAction).toHaveAttribute('data-test-prefetch', 'undefined');
    fireEvent.focus(publicAction);
    fireEvent.mouseEnter(publicAction);
    expect(publicAction).toHaveAttribute('data-test-prefetch', 'undefined');
  });

  it('renders the canonical notification hero with bounded headline and CTA', () => {
    render(<ArtistNotificationsHero hero={ARTIST_NOTIFICATIONS_COPY.hero} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: segmentedAccessibleName('Reach Every Fan.', 'On Autopilot.'),
      })
    ).not.toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('link', {
        name: ARTIST_NOTIFICATIONS_COPY.hero.primaryCtaLabel,
      })
    ).toHaveAttribute('href', ARTIST_NOTIFICATIONS_COPY.hero.primaryCtaHref);

    const cardStage = screen.getByTestId('artist-notifications-card-stage');
    for (const card of ARTIST_NOTIFICATIONS_COPY.hero.floatingCards) {
      expect(cardStage).toHaveTextContent(card.title);
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
