import { describe, expect, it } from 'vitest';
import {
  buildCreditedArtistReconciliationPlan,
  type CreditedArtistCandidate,
} from '@/lib/discography/collaborator-profile-plan';

const austin: CreditedArtistCandidate = {
  artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
  name: 'Austin Leeds',
  spotifyId: 'spotify-austin',
  imageUrl: null,
};

describe('credited artist reconciliation plan', () => {
  it('is deterministic and idempotently collapses repeated import edges', () => {
    const details = [
      {
        id: 'spotify-austin',
        name: 'Austin Leeds',
        images: [{ url: 'https://i.scdn.co/austin.jpg' }],
      },
    ];

    const first = buildCreditedArtistReconciliationPlan(
      [austin, { ...austin }, { ...austin }],
      details
    );
    const repeated = buildCreditedArtistReconciliationPlan(
      [{ ...austin }, austin],
      details
    );

    expect(first).toEqual(repeated);
    expect(first).toHaveLength(1);
    expect(first[0]?.candidate.artistId).toBe(austin.artistId);
    expect(first[0]?.spotifyArtist?.id).toBe('spotify-austin');
  });

  it('keeps same-name artists distinct by exact registry/provider IDs', () => {
    const secondAlex: CreditedArtistCandidate = {
      artistId: 'e061a679-466c-465a-a545-64a7e39aa3c6',
      name: 'Alex Lee',
      spotifyId: 'spotify-alex-two',
      imageUrl: null,
    };
    const firstAlex: CreditedArtistCandidate = {
      ...austin,
      name: 'Alex Lee',
      spotifyId: 'spotify-alex-one',
    };

    const plan = buildCreditedArtistReconciliationPlan(
      [firstAlex, secondAlex],
      []
    );

    expect(plan.map(item => item.candidate.artistId)).toEqual([
      firstAlex.artistId,
      secondAlex.artistId,
    ]);
    expect(plan.every(item => item.spotifyArtist === undefined)).toBe(true);
  });

  it('never joins metadata by display name or alias', () => {
    const plan = buildCreditedArtistReconciliationPlan(
      [austin],
      [{ id: 'spotify-someone-else', name: 'Austin Leeds' }]
    );

    expect(plan[0]?.spotifyArtist).toBeUndefined();
  });
});
