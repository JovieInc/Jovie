import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import { ArtistInfo } from './ArtistInfo';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: ReactNode;
    readonly href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({
    size,
    sizes,
  }: {
    readonly size: string;
    readonly sizes: string;
  }) => <div data-testid='artist-avatar' data-size={size} data-sizes={sizes} />,
}));

vi.mock('@/components/atoms/ArtistName', () => ({
  ArtistName: ({ name }: { readonly name: string }) => <span>{name}</span>,
}));

vi.mock('@/features/profile/ProfilePhotoContextMenu', () => ({
  ProfilePhotoContextMenu: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const artist = {
  id: 'artist-1',
  handle: 'jordan-lee',
  name: 'Jordan Lee',
  image_url: 'https://example.com/jordan.jpg',
  tagline: 'Independent artist',
  is_verified: true,
} as unknown as Artist;

describe('ArtistInfo', () => {
  it('binds the default desktop presentation to the canonical display size', () => {
    render(<ArtistInfo artist={artist} />);

    expect(screen.getByTestId('artist-avatar')).toHaveAttribute(
      'data-size',
      'display-2xl'
    );
    expect(screen.getByTestId('artist-avatar')).toHaveAttribute(
      'data-sizes',
      '224px'
    );
    expect(
      screen.getByRole('link', { name: "Go to Jordan Lee's profile" })
    ).toHaveAttribute('href', '/jordan-lee');
  });

  it('uses the compact canonical size for a small mobile presentation', () => {
    render(
      <ArtistInfo
        artist={artist}
        avatarSize='sm'
        viewport='mobile'
        linkToProfile={false}
      />
    );

    expect(screen.getByTestId('artist-avatar')).toHaveAttribute(
      'data-size',
      'lg'
    );
    expect(screen.getByTestId('artist-avatar')).toHaveAttribute(
      'data-sizes',
      '32px'
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
