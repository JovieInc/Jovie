import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistHero } from '@/features/profile/ProfileHeroCard';
import { ProfileViewportShell } from '@/features/profile/ProfileViewportShell';

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    className,
    sizes,
  }: {
    alt: string;
    className?: string;
    sizes?: string;
  }) => (
    <div
      data-testid='image-with-fallback'
      data-alt={alt}
      data-class-name={className}
      data-sizes={sizes}
    />
  ),
}));

const artist = {
  handle: 'tim',
  id: 'artist-1',
  image_url: 'https://example.com/avatar.jpg',
  name: 'Tim White',
} as const;

describe('profile V2 layout constraints', () => {
  it('keeps the desktop shell centered without forcing a two-column split', () => {
    render(
      <ProfileViewportShell
        ambientImageUrl='https://example.com/ambient.jpg'
        artistName='Tim White'
        header={<div>Hero</div>}
      >
        <div>Profile content</div>
      </ProfileViewportShell>
    );

    expect(screen.getByTestId('profile-viewport-shell')).toHaveClass(
      'md:rounded-[var(--profile-shell-card-radius)]'
    );
  });

  it('requests a responsive editorial hero image size on desktop', () => {
    render(
      <ArtistHero
        artist={artist as never}
        heroImageUrl='https://example.com/hero.jpg'
        latestRelease={null}
        primaryAction={{ label: 'Listen Now', onClick: () => {} }}
        onBellClick={() => {}}
        onPlayClick={() => {}}
        spotlightLabel='Latest release'
        spotlightValue='Mar 31'
      />
    );

    expect(screen.getByTestId('image-with-fallback')).toHaveAttribute(
      'data-sizes',
      '(max-width: 767px) 100vw, 620px'
    );
  });

  it('uses a taller immersive hero instead of the compressed banner height', () => {
    const { container } = render(
      <ArtistHero
        artist={artist as never}
        heroImageUrl='https://example.com/hero.jpg'
        latestRelease={null}
        primaryAction={{ label: 'Listen Now', onClick: () => {} }}
        onBellClick={() => {}}
        onPlayClick={() => {}}
        spotlightLabel='Latest release'
        spotlightValue='Mar 31'
      />
    );

    expect(container.firstChild).toHaveClass(
      'h-[48dvh]',
      'min-h-[420px]',
      'max-h-[620px]'
    );
  });
});
