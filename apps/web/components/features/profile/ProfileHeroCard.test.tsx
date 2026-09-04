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
      name: 'Get Tim White tickets',
    });
    expect(primaryAction).toHaveAttribute('href', '/timwhite/tour');
    expect(primaryAction).toHaveClass('min-h-12');

    const playButton = screen.getByRole('button', {
      name: 'Listen to Tim White',
    });
    expect(playButton).toHaveClass('min-h-11');

    const alertsButton = screen.getByRole('button', {
      name: 'Manage alerts for Tim White',
    });
    expect(alertsButton).toHaveClass('h-11', 'min-w-11');
  });
});
