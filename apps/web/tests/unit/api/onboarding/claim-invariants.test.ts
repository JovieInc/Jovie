import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import { deriveClaimedOnboardingStateFromMessageRows } from '@/lib/onboarding/claimed-state';
import { validateUsername } from '@/lib/validation/username';

const validHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9]{2,15}$/)
  .filter(handle => validateUsername(handle).isValid);

const artistIdArb = fc.stringMatching(/^[A-Za-z0-9]{22}$/);

function handleMessageRow(handle: string) {
  return {
    toolCalls: encodeToolEvents([
      {
        type: 'tool-proposeHandle',
        toolCallId: `tc-handle-${handle}`,
        state: 'output-available',
        input: { handle },
        output: {
          action: 'handle_confirmed',
          handle,
        },
      } as never,
    ]),
  };
}

function artistMessageRow(id: string, name: string, followers: number) {
  return {
    toolCalls: encodeToolEvents([
      {
        type: 'tool-confirmSpotifyArtist',
        toolCallId: `tc-artist-${id}`,
        state: 'output-available',
        input: { spotifyId: id },
        output: {
          action: 'spotify_artist_confirmed',
          artist: {
            id,
            name,
            url: `https://open.spotify.com/artist/${id}`,
            followers,
            popularity: 40,
            genres: ['indie'],
          },
        },
      } as never,
    ]),
  };
}

describe('claim state derivation invariants (real production deriveClaimedOnboardingStateFromMessageRows)', () => {
  it('recency ordering: the latest valid handle confirmation in message order always wins', () => {
    fc.assert(
      fc.property(
        fc.array(validHandleArb, { minLength: 1, maxLength: 8 }),
        handles => {
          const rows = handles.map(h =>
            handleMessageRow(`@${h.toUpperCase()}`)
          );
          const derived = deriveClaimedOnboardingStateFromMessageRows(rows);
          expect(derived.handle).toBe(handles.at(-1));
        }
      )
    );
  });

  it('recency ordering: the latest confirmed Spotify artist overrides earlier selections', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: artistIdArb,
            followers: fc.integer({ min: 0, max: 250_000 }),
          }),
          { minLength: 1, maxLength: 6 }
        ),
        artists => {
          const rows = artists.map((artist, idx) =>
            artistMessageRow(artist.id, `Artist ${idx}`, artist.followers)
          );
          const derived = deriveClaimedOnboardingStateFromMessageRows(rows);
          const expected = artists.at(-1)!;
          expect(derived.artist?.id).toBe(expected.id);
          expect(derived.artist?.followers).toBe(expected.followers);
        }
      )
    );
  });

  it('idempotent derivation: re-encoding the winning state yields identical claimed state', () => {
    fc.assert(
      fc.property(validHandleArb, artistIdArb, (handle, artistId) => {
        const rows = [
          artistMessageRow(artistId, 'Idempotent Artist', 820),
          handleMessageRow(handle),
        ];
        const once = deriveClaimedOnboardingStateFromMessageRows(rows);
        const twice = deriveClaimedOnboardingStateFromMessageRows([
          artistMessageRow(
            once.artist!.id,
            once.artist!.name,
            once.artist!.followers ?? 0
          ),
          handleMessageRow(once.handle!),
        ]);
        expect(twice).toEqual(once);
      })
    );
  });

  it('failure path safety: empty or malformed toolCalls rows never throw and yield null state', () => {
    expect(
      deriveClaimedOnboardingStateFromMessageRows([
        { toolCalls: null },
        { toolCalls: 'not-an-array' },
        { toolCalls: [{ malformed: true }] },
      ])
    ).toEqual({
      artist: null,
      handle: null,
      socialLinks: [],
      interviewSignals: [],
    });
  });
});
