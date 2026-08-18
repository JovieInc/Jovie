import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPlaylistsContent } from './AdminPlaylistsContent';
import type { AdminPlaylistRow } from './playlists-data';

const pendingPlaylist = {
  id: 'playlist-1',
  title: 'Midnight Focus',
  slug: 'midnight-focus',
  status: 'pending',
  trackCount: 24,
  genreTags: ['ambient', 'electronic'],
  createdAt: new Date('2026-08-18T06:00:00.000Z'),
  publishedAt: null,
  spotifyPlaylistId: null,
} satisfies AdminPlaylistRow;

describe('AdminPlaylistsContent', () => {
  it('renders the canonical workspace empty state with tab-specific copy', () => {
    render(
      <AdminPlaylistsContent
        currentTab='pending'
        playlists={[]}
        approveAction={vi.fn()}
        rejectAction={vi.fn()}
      />
    );

    const emptyState = screen.getByTestId('admin-playlists-empty-state');
    expect(emptyState).toHaveTextContent('No Pending Playlists');
    expect(emptyState).toHaveTextContent('Next one generates at 6:00 AM UTC.');
    expect(emptyState).toHaveClass('min-h-80');
  });

  it('preserves pending review actions and playlist metadata', () => {
    render(
      <AdminPlaylistsContent
        currentTab='pending'
        playlists={[pendingPlaylist]}
        approveAction={vi.fn()}
        rejectAction={vi.fn()}
      />
    );

    expect(screen.getByText('Midnight Focus')).toBeInTheDocument();
    expect(screen.getByText(/24 tracks/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(document.querySelectorAll('input[name="playlistId"]')).toHaveLength(
      2
    );
  });

  it('links published playlists to Spotify without review actions', () => {
    render(
      <AdminPlaylistsContent
        currentTab='published'
        playlists={[
          {
            ...pendingPlaylist,
            status: 'published',
            spotifyPlaylistId: 'spotify-playlist-1',
          },
        ]}
        approveAction={vi.fn()}
        rejectAction={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(
      screen.getByRole('link', { name: /View on Spotify/ })
    ).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/spotify-playlist-1'
    );
  });
});
