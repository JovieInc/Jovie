import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PROFILE_HERO_COMPOSITION_CLASSNAME } from '@/lib/profile/composition';
import { ProfileHeroCard } from './ProfileHeroCard';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src?: string | null;
  }) => <img alt={alt} src={src ?? undefined} />,
}));

describe('ProfileHeroCard', () => {
  it('renders the bounded hero title and primary actions', () => {
    render(
      <ProfileHeroCard
        artist={PROFILE_STORY_ARTIST}
        primaryAction={{
          label: 'Get tickets',
          href: '/timwhite/tour',
          ariaLabel: 'Get Tim White tickets',
        }}
        onPlayClick={() => undefined}
        onBellClick={() => undefined}
        primaryActionKind='tickets'
      />
    );

    expect(screen.getByTestId('profile-header')).toHaveClass(
      ...PROFILE_HERO_COMPOSITION_CLASSNAME.split(' ')
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'line-clamp-3'
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Tim White'
    );

    const primaryAction = screen.getByRole('link', {
      name: 'Get tickets — Get Tim White tickets',
    });
    expect(primaryAction).toHaveAttribute('href', '/timwhite/tour');
    expect(primaryAction).toHaveClass('min-h-12');

    const playButton = screen.getByRole('button', {
      name: 'Play — Listen to Tim White',
    });
    expect(playButton).toHaveClass('min-h-11');

    const alertsButton = screen.getByRole('button', {
      name: 'Notify — Manage alerts for Tim White',
    });
    expect(alertsButton).toHaveClass('h-11', 'min-w-11');
  });
});

describe('ProfileHeroCard focus ring', () => {
  it('draws every hero action focus ring from the canonical focus token', () => {
    render(
      <ProfileHeroCard
        artist={PROFILE_STORY_ARTIST}
        primaryAction={{
          label: 'Get tickets',
          href: '/timwhite/tour',
          ariaLabel: 'Get Tim White tickets',
        }}
        onPlayClick={() => undefined}
        onBellClick={() => undefined}
        primaryActionKind='tickets'
      />
    );

    const actions = [
      screen.getByRole('link', {
        name: 'Get tickets — Get Tim White tickets',
      }),
      screen.getByRole('button', { name: 'Play — Listen to Tim White' }),
      screen.getByRole('button', {
        name: 'Notify — Manage alerts for Tim White',
      }),
    ];
    for (const action of actions) {
      expect(action).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-focus'
      );
      expect(action.className).not.toContain('var(--focus-ring)');
    }
  });
});
