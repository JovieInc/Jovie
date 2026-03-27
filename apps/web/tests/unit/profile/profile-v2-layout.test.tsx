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

vi.mock('@/components/molecules/SocialLink', () => ({
  SocialLink: () => <div data-testid='hero-social-link' />,
}));

const artist = {
  handle: 'tim',
  id: 'artist-1',
  image_url: 'https://example.com/avatar.jpg',
  name: 'Tim White',
} as const;

describe('profile V2 layout constraints', () => {
  it('keeps the desktop shell boxed to a mobile-width card', () => {
    render(
      <ProfileViewportShell
        ambientImageUrl='https://example.com/ambient.jpg'
        artistName='Tim White'
      >
        <div>Profile content</div>
      </ProfileViewportShell>
    );

    expect(screen.getByTestId('profile-viewport-shell')).toHaveClass(
      'md:max-w-[440px]',
      'md:rounded-xl'
    );
  });

  it('constrains hero image sizing instead of requesting desktop 100vw', () => {
    render(
      <ArtistHero
        artist={artist as never}
        heroImageUrl='https://example.com/hero.jpg'
        latestRelease={null}
        headerSocialLinks={[]}
        onBellClick={() => {}}
        onPlayClick={() => {}}
      />
    );

    expect(screen.getByTestId('image-with-fallback')).toHaveAttribute(
      'data-sizes',
      '(max-width: 768px) 100vw, 440px'
    );
  });
});
