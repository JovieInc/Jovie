import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseMetadata } from '@/components/organisms/release-sidebar/ReleaseMetadata';
import type { Release } from '@/components/organisms/release-sidebar/types';

function buildRelease(overrides: Partial<Release> = {}): Release {
  return {
    profileId: 'profile_1',
    id: 'release_1',
    title: 'Midnight Echo',
    releaseDate: '2025-06-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/artwork.jpg',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo--profile_1',
    spotifyPopularity: 72,
    providers: [],
    releaseType: 'single',
    upc: '123456789012',
    label: 'North Star Records',
    totalTracks: 1,
    totalDurationMs: 185000,
    primaryIsrc: 'USRC17607839',
    genres: ['Indie Pop'],
    canvasStatus: 'not_set',
    ...overrides,
  };
}

describe('ReleaseMetadata canvas status', () => {
  it('shows live status when canvas is uploaded', () => {
    render(
      <ReleaseMetadata release={buildRelease({ canvasStatus: 'uploaded' })} />
    );

    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows ready to upload when canvas is generated', () => {
    render(
      <ReleaseMetadata release={buildRelease({ canvasStatus: 'generated' })} />
    );

    expect(screen.getByText('Ready to upload')).toBeInTheDocument();
  });

  it('defaults to not set when canvas status is missing', () => {
    render(
      <ReleaseMetadata release={buildRelease({ canvasStatus: undefined })} />
    );

    expect(screen.getByText('Not set')).toBeInTheDocument();
  });
});
