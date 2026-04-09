import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Artist, LegacySocialLink } from '@/types/db';

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: (props: Record<string, unknown>) => (
    <div
      data-testid='static-artist-page'
      data-mode={String(props.mode)}
      data-artist-handle={String((props.artist as Artist).handle)}
    />
  ),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  owner_user_id: 'owner-1',
  handle: 'testartist',
  spotify_id: 'spotify-1',
  name: 'Test Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
};

describe('ProgressiveArtistPage', () => {
  it('always renders the static artist page path', async () => {
    const { ProgressiveArtistPage } = await import(
      '@/features/profile/ProgressiveArtistPage'
    );

    render(
      <ProgressiveArtistPage
        mode='tip'
        artist={mockArtist}
        socialLinks={[] as LegacySocialLink[]}
        contacts={[]}
        subtitle='Profile subtitle'
        showBackButton
      />
    );

    const staticArtistPage = screen.getByTestId('static-artist-page');
    expect(staticArtistPage).toHaveAttribute('data-mode', 'tip');
    expect(staticArtistPage).toHaveAttribute(
      'data-artist-handle',
      mockArtist.handle
    );
  });
});
