import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import { ProfileSection } from './ProfileSection';

vi.mock('@/components/molecules/ArtistInfo', () => ({
  ArtistInfo: ({ artist }: { readonly artist: Artist }) => <p>{artist.name}</p>,
}));

vi.mock('@/components/molecules/FrostedContainer', () => ({
  FrostedContainer: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/site/Container', () => ({
  Container: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const artist = {
  id: 'artist-1',
  handle: 'jordan-lee',
  name: 'Jordan Lee',
} as unknown as Artist;

describe('ProfileSection', () => {
  it('uses min-h-svh so iOS Safari chrome cannot jump the public profile column', () => {
    const { container } = render(<ProfileSection artist={artist} />);
    const column = container.querySelector('.min-h-svh');

    expect(column).toBeTruthy();
    expect(column?.className).not.toContain('min-h-screen');
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  });
});
