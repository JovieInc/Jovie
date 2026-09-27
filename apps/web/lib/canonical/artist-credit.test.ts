import { describe, expect, it } from 'vitest';
import { ARTIST_CREDIT_CONTRACT, admitArtistCredit } from './artist-credit';
import { requireCanonical, SemanticContractError } from './semantic-contract';

const PROVENANCE = {
  producer: 'test-producer@1',
  source: 'spotify',
  confidence: 'imported' as const,
};

const ARTIST_UUID = '123e4567-e89b-42d3-a456-426614174000';

const codes = (raw: unknown) =>
  admitArtistCredit(raw, PROVENANCE).rejections.map(r => r.code);

describe('ARTIST_CREDIT_CONTRACT (JOV-6543 deliberate-red fixtures)', () => {
  it('accepts a normal primary credit edge', () => {
    const decision = admitArtistCredit(
      {
        artistId: ARTIST_UUID,
        role: 'main_artist',
        isPrimary: true,
        position: 0,
      },
      PROVENANCE
    );
    expect(decision.status).toBe('accepted');
    expect(decision.canonical).toEqual({
      artistId: ARTIST_UUID,
      role: 'main_artist',
      isPrimary: true,
      position: 0,
    });
    expect(decision.field).toBe('artist_credit');
    expect(decision.contractVersion).toBe(1);
  });

  it('admits every co-primary independently; dedup is not a contract concern', () => {
    // JOV-6543: co-primaries are never dropped at admission. Two distinct
    // registry artists in source order are both admissible as primary.
    const first = admitArtistCredit(
      {
        artistId: ARTIST_UUID,
        role: 'main_artist',
        isPrimary: true,
        position: 0,
      },
      PROVENANCE
    );
    const second = admitArtistCredit(
      {
        artistId: '223e4567-e89b-42d3-a456-426614174001',
        role: 'main_artist',
        isPrimary: true,
        position: 1,
      },
      PROVENANCE
    );
    expect(first.status).toBe('accepted');
    expect(second.status).toBe('accepted');
  });

  it('quarantines featured/remixer/production roles promoted to primary', () => {
    for (const role of [
      'featured_artist',
      'remixer',
      'producer',
      'co_producer',
      'composer',
      'lyricist',
      'mix_engineer',
      'mastering_engineer',
    ]) {
      const decision = admitArtistCredit(
        { artistId: ARTIST_UUID, role, isPrimary: true, position: 0 },
        PROVENANCE
      );
      expect(decision.status).toBe('quarantined');
      expect(codes({ artistId: ARTIST_UUID, role, isPrimary: true })).toContain(
        'unsupported_primary_promotion'
      );
    }
  });

  it('still admits those same roles as non-primary credits', () => {
    for (const role of ['featured_artist', 'remixer', 'producer']) {
      const decision = admitArtistCredit(
        { artistId: ARTIST_UUID, role, isPrimary: false, position: 2 },
        PROVENANCE
      );
      expect(decision.status).toBe('accepted');
      expect(decision.canonical?.role).toBe(role);
    }
  });

  it('quarantines credits referencing a name or handle instead of a registry UUID', () => {
    for (const artistId of [
      'Fedde Le Grand',
      'feddelegrand',
      'spotify:artist:abc',
      'artist-1',
      42,
      null,
    ]) {
      expect(
        admitArtistCredit({ artistId, role: 'main_artist' }, PROVENANCE).status
      ).toBe('quarantined');
      expect(codes({ artistId, role: 'main_artist' })).toContain(
        'invalid_artist_id'
      );
    }
  });

  it('quarantines unsupported role observations', () => {
    for (const role of ['headliner', 'dj', '', 'MAIN_ARTIST', 7]) {
      expect(
        admitArtistCredit({ artistId: ARTIST_UUID, role }, PROVENANCE).status
      ).toBe('quarantined');
      expect(codes({ artistId: ARTIST_UUID, role })).toContain(
        'unsupported_role'
      );
    }
  });

  it('quarantines non-integer or negative positions that would lose source order', () => {
    for (const position of [-1, 1.5, Number.NaN, '0']) {
      expect(
        admitArtistCredit(
          { artistId: ARTIST_UUID, role: 'main_artist', position },
          PROVENANCE
        ).status
      ).toBe('quarantined');
      expect(
        codes({ artistId: ARTIST_UUID, role: 'main_artist', position })
      ).toContain('invalid_position');
    }
  });

  it('quarantines non-boolean isPrimary flags', () => {
    expect(
      codes({ artistId: ARTIST_UUID, role: 'main_artist', isPrimary: 'yes' })
    ).toContain('invalid_primary_flag');
  });

  it('quarantines non-object observations', () => {
    for (const raw of [null, undefined, 'main_artist', [ARTIST_UUID], 0]) {
      expect(admitArtistCredit(raw, PROVENANCE).status).toBe('quarantined');
      expect(codes(raw)).toContain('not_an_object');
    }
  });

  it('requireCanonical throws SemanticContractError carrying the decision', () => {
    expect(() =>
      requireCanonical(
        ARTIST_CREDIT_CONTRACT,
        {
          artistId: ARTIST_UUID,
          role: 'featured_artist',
          isPrimary: true,
        },
        PROVENANCE
      )
    ).toThrow(SemanticContractError);
    try {
      requireCanonical(
        ARTIST_CREDIT_CONTRACT,
        { artistId: ARTIST_UUID, role: 'featured_artist', isPrimary: true },
        PROVENANCE
      );
    } catch (error) {
      const decision = (error as SemanticContractError).decision;
      expect(decision.status).toBe('quarantined');
      expect(decision.rejections.map(r => r.code)).toContain(
        'unsupported_primary_promotion'
      );
    }
  });
});
