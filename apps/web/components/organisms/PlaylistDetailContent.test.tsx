import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK,
} from '@/components/features/home/homepage-profile-preview-fixture';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { PlaylistDetailContent } from './PlaylistDetailContent';
import {
  PLAYLIST_DETAIL_STORY_PLAYLIST,
  PLAYLIST_DETAIL_STORY_TRACKS,
} from './PlaylistDetailContent.stories';

vi.mock('@/components/features/share/PublicShareMenu', () => ({
  PublicShareMenu: ({ trigger }: { readonly trigger: ReactNode }) => trigger,
}));

describe('PlaylistDetailContent', () => {
  it('renders the shipped playlist body with deterministic canonical rows', () => {
    const { container } = render(
      <PlaylistDetailContent
        playlist={PLAYLIST_DETAIL_STORY_PLAYLIST}
        tracks={PLAYLIST_DETAIL_STORY_TRACKS}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.title,
      })
    ).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.title,
      })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tracklist' })
    ).toBeInTheDocument();

    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    for (const track of PLAYLIST_DETAIL_STORY_TRACKS) {
      expect(screen.getByText(track.trackName)).toBeVisible();
    }
    for (const artistLink of screen.getAllByRole('link', {
      name: TIM_WHITE_PROFILE.name,
    })) {
      expect(artistLink).toHaveAttribute(
        'href',
        TIM_WHITE_PROFILE.publicProfilePath
      );
    }
    expect(screen.getByRole('button', { name: 'Share' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Discover More Playlists' })
    ).toHaveAttribute('href', '/playlists');
    expect(
      screen.queryByRole('link', { name: 'Open in Spotify' })
    ).not.toBeInTheDocument();
  });

  it('keeps the story identity aligned to existing checked-in fixtures', () => {
    expect(PLAYLIST_DETAIL_STORY_PLAYLIST).toEqual({
      slug: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.playlistId.replace(
        /^playlist-/,
        ''
      ),
      title: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.title,
      coverImageUrl: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.imageUrl,
      description: null,
      shareDescription: null,
      spotifyPlaylistId: null,
    });
    expect(PLAYLIST_DETAIL_STORY_TRACKS.map(track => track.trackName)).toEqual(
      HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES.slice(1, 4).map(
        release => release.title
      )
    );
    expect(
      PLAYLIST_DETAIL_STORY_TRACKS.every(
        track =>
          track.artistName === TIM_WHITE_PROFILE.name &&
          track.username === TIM_WHITE_PROFILE.publicProfileHandle
      )
    ).toBe(true);
  });

  it('shares one production body while route-only contracts stay in the route', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(dynamic)/playlists/[slug]/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/PlaylistDetailContent.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain('export const dynamicParams = false');
    expect(routeSource).toContain('export const revalidate = false');
    expect(routeSource).toContain('generateStaticParams');
    expect(routeSource).toContain('generateMetadata');
    expect(routeSource).toContain('notFound()');
    expect(routeSource).toContain('safeJsonLdStringify(playlistJsonLd)');
    expect(routeSource).toContain('safeJsonLdStringify(breadcrumbJsonLd)');
    expect(routeSource).toContain('<PlaylistDetailContent');
    expect(routeSource).toContain('tracks={tracks.map(track => ({');
    expect(routeSource).toContain('spotifyTrackId: track.spotifyTrackId');
    expect(routeSource).not.toContain('<MarketingContainer');
    expect(storySource).toContain('component: PlaylistDetailContent');
    expect(storySource).toContain("registryId: 'web-010-playlists--[slug]'");
    expect(storySource).toContain("route: '/playlists/[slug]'");
    expect(storySource).toContain(
      "sourceSha: 'e21d2e01bc80d7e0146a071207c406e1cd762bd3'"
    );
  });
});
