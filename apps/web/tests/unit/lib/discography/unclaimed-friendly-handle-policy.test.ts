import { describe, expect, it, vi } from 'vitest';

// The reconciliation module is a server module with DB dependencies. Its
// handle-selection policy is exercised through the pure composer contract
// here; the transactional wiring is covered by
// tests/integration/collaborator-profile-concurrency.test.ts on a live DB.
vi.mock('server-only', () => ({}));

import { buildUnclaimedArtistHandle } from '@/lib/discography/artist-profile-routing';
import { composeFriendlyArtistHandleCandidates } from '@/lib/discography/friendly-artist-handle';
import { isEncodedUnclaimedArtistHandle } from '@/lib/profile/opaque-internal-profile-handle';

describe('JOV-6528 handle policy: friendly first, opaque fallback last', () => {
  it('a fully free surface reserves the top-ranked friendly handle', () => {
    const { accepted } = composeFriendlyArtistHandleCandidates({
      registryName: 'Fedde Le Grand',
      providerArtist: { id: 'sp-fedde', name: 'Fedde Le Grand' },
    });

    // simulate the in-transaction selection: first candidate that is free
    const taken = new Set<string>(['someotherartist']);
    const selected = accepted.find(c => !taken.has(c.handle))?.handle ?? null;

    expect(selected).toBe('feddelegrand');
    expect(isEncodedUnclaimedArtistHandle(selected)).toBe(false);
  });

  it('skips taken candidates in rank order and never publishes a_* when a friendly form is free', () => {
    const { accepted } = composeFriendlyArtistHandleCandidates({
      registryName: 'Fedde Le Grand',
      providerArtist: { id: 'sp-fedde', name: 'Fedde Le Grand' },
    });

    const taken = new Set(['feddelegrand']);
    const selected = accepted.find(c => !taken.has(c.handle))?.handle ?? null;

    expect(selected).toBe('fedde');
    expect(isEncodedUnclaimedArtistHandle(selected)).toBe(false);
  });

  it('falls back to the opaque a_* handle only when every friendly candidate is taken', () => {
    const { accepted } = composeFriendlyArtistHandleCandidates({
      registryName: 'Fedde Le Grand',
      providerArtist: { id: 'sp-fedde', name: 'Fedde Le Grand' },
    });

    const taken = new Set(accepted.map(c => c.handle));
    const friendlyFree =
      accepted.find(c => !taken.has(c.handle))?.handle ?? null;
    // All friendly forms taken -> the deterministic fallback applies.
    const fallback = buildUnclaimedArtistHandle(
      'f5441adb-6789-449a-9553-ab7460c9c61c'
    );

    expect(friendlyFree).toBeNull();
    expect(fallback).toMatch(/^a_[0-9a-z]{25}$/);
    expect(isEncodedUnclaimedArtistHandle(fallback)).toBe(true);
  });

  it('never proposes the a_* shape as a friendly candidate', () => {
    const { accepted } = composeFriendlyArtistHandleCandidates({
      registryName: 'a username that looks opaque a_1234567890123456789012345',
      providerArtist: undefined,
    });
    for (const candidate of accepted) {
      expect(isEncodedUnclaimedArtistHandle(candidate.handle)).toBe(false);
    }
  });
});
