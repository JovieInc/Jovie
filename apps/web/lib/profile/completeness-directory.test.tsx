import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('./completeness.server', () => ({ loadProfileCompleteness: vi.fn() }));

import { ArtistsDirectory } from '@/components/organisms/ArtistsDirectory';
import {
  assessProfileCompleteness,
  PROFILE_COMPLETENESS_POLICY,
  type ProfileCompletenessSnapshot,
  prepareProfileCompleteness,
} from './completeness-certification';
import { toArtistsDirectoryProfiles } from './public-discovery-catalog';

describe('rendered directory completeness gate', () => {
  it('renders only the evaluated complete profile, excluding missing-photo and stale entries', () => {
    const now = new Date();
    const complete: ProfileCompletenessSnapshot = {
      profileId: '11111111-1111-4111-8111-111111111111',
      revision: '1',
      username: 'riverlane',
      displayName: 'River Lane',
      avatarUrl: 'https://cdn.jov.ie/river.jpg',
      bio: 'Soul artist from Atlanta.',
      destinations: [
        { platform: 'spotify', url: 'https://open.spotify.com/artist/river' },
      ],
      provenance: [
        {
          kind: 'public_source',
          referenceId: 'source-1',
          url: 'https://linktr.ee/riverlane',
        },
      ],
    };
    const profiles = [
      complete,
      {
        ...complete,
        profileId: '22222222-2222-4222-8222-222222222222',
        username: 'moonshore',
        displayName: 'Moon Shore',
        avatarUrl: null,
      },
      {
        ...complete,
        profileId: '33333333-3333-4333-8333-333333333333',
        username: 'sunriseband',
        displayName: 'Sunrise Band',
      },
    ];
    const eligible = new Set(
      profiles
        .filter(
          (profile, index) =>
            assessProfileCompleteness(
              profile,
              {
                schemaVersion: PROFILE_COMPLETENESS_POLICY,
                policyVersion: PROFILE_COMPLETENESS_POLICY,
                profileId: profile.profileId,
                snapshotSha256:
                  prepareProfileCompleteness(profile).snapshotSha256,
                evaluatedAt:
                  index === 2 ? '2020-01-01T00:00:00Z' : now.toISOString(),
                model: 'typesafe-ai/jev',
                transportStatus: 'evaluated',
                verdict: 'supported',
                reasons: ['jev_supported'],
                confidence: null,
              },
              now
            ).eligible
        )
        .map(profile => profile.profileId)
    );
    render(
      <ArtistsDirectory
        profiles={toArtistsDirectoryProfiles(
          profiles.map(profile => ({
            ...profile,
            id: profile.profileId,
            isPublic: true,
          })),
          eligible
        )}
      />
    );
    expect(screen.getByRole('link', { name: /River Lane/ })).toHaveAttribute(
      'href',
      '/riverlane'
    );
    expect(screen.queryByText('Moon Shore')).not.toBeInTheDocument();
    expect(screen.queryByText('Sunrise Band')).not.toBeInTheDocument();
  });
});
