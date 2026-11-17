import { describe, expect, it, vi } from 'vitest';
import {
  qualificationInputsPatch,
  qualifyRoleEntrant,
} from './role-qualification';

const now = new Date('2026-11-08T05:00:00Z');
const artistId = '4Z8W4fKeB5YxbusRsdQVPb';

describe('qualifyRoleEntrant', () => {
  it('returns nothing when the form sent no artist and no answers', async () => {
    const read = vi.fn();
    expect(await qualifyRoleEntrant({ now }, read)).toBeNull();
    expect(await qualifyRoleEntrant({ momTest: {}, now }, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('scores a confirmed artist from the server read, not the client', async () => {
    const result = await qualifyRoleEntrant(
      { spotifyArtistId: artistId, now },
      async () => ({
        id: artistId,
        name: 'Example Artist',
        followers: 50_000,
        popularity: 100,
      })
    );
    expect(result?.spotifyArtistName).toBe('Example Artist');
    expect(result?.admissionScore?.components).toEqual({
      identity: 30,
      audience: 30,
      catalog: 0,
      intent: 0,
    });
    expect(result?.admissionScore?.unmeasured).toEqual(['catalog']);
    expect(result?.momTest).toBeNull();
  });

  it('scores an id Spotify does not know as unresolved', async () => {
    const result = await qualifyRoleEntrant(
      { spotifyArtistId: artistId, now },
      async () => null
    );
    expect(result?.spotifyArtistName).toBeNull();
    expect(result?.admissionScore?.score).toBe(0);
  });

  it('leaves the entrant unscored, not judged, when Spotify fails', async () => {
    const result = await qualifyRoleEntrant(
      { spotifyArtistId: artistId, now },
      async () => {
        throw new Error('timeout');
      }
    );
    expect(result?.spotifyArtistId).toBe(artistId);
    expect(result?.admissionScore).toBeNull();
    expect(qualificationInputsPatch(result!)).toEqual({
      spotifyArtistId: artistId,
    });
  });

  it('records Mom Test answers with their variant and does not weight them', async () => {
    const result = await qualifyRoleEntrant(
      {
        momTest: {
          lastGrowthAttempt: 'Played two showcases',
          promoSpend: '50_plus',
        },
        now,
      },
      vi.fn()
    );
    expect(result?.admissionScore).toBeNull();
    expect(result?.momTest).toEqual({
      lastGrowthAttempt: 'Played two showcases',
      promoSpend: '50_plus',
      variant: 'request-access/v1',
      capturedAt: now.toISOString(),
    });
  });
});
