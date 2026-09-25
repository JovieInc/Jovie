import { beforeEach, describe, expect, it, vi } from 'vitest';

import { trackMagicMomentIfReady } from '@/lib/analytics';

/**
 * JOV-6459 — activation delivery contract for the client magic-moment helper.
 *
 * The localStorage completion marker is bookkeeping that records a completed
 * DELIVERY. It must never be written after a skipped dispatch (missing gtag
 * from ad blockers, denied consent, or a late loader) — a marker without
 * delivery permanently erases activation evidence by claiming an event that
 * never reached the analytics backend.
 */

const gtagMock = vi.fn();

function setGtag(impl: ((...args: unknown[]) => void) | undefined) {
  if (impl) {
    (globalThis as { gtag?: unknown }).gtag = impl;
  } else {
    delete (globalThis as { gtag?: unknown }).gtag;
  }
}

const READY_PARAMS = {
  profileId: '11111111-1111-4111-8111-111111111111',
  hasAvatar: true,
  hasDisplayName: true,
  dspLinkCount: 1,
  releaseCount: 1,
  signupTimestamp: Date.now() - 1000,
  enrichmentStatus: 'complete',
};

describe('trackMagicMomentIfReady delivery contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
    setGtag(gtagMock);
  });

  it('writes the completion marker only after a real gtag dispatch', () => {
    const result = trackMagicMomentIfReady(READY_PARAMS);

    expect(result).toBe(true);
    expect(gtagMock).toHaveBeenCalledWith(
      'event',
      'magic_moment_achieved',
      expect.objectContaining({ dspLinkCount: 1 })
    );
    expect(
      globalThis.localStorage.getItem(
        `magic_moment_achieved_${READY_PARAMS.profileId}`
      )
    ).toBeTruthy();
  });

  it('never writes a marker when gtag is missing (ad blocker, late loader)', () => {
    setGtag(undefined);
    const result = trackMagicMomentIfReady(READY_PARAMS);

    // Skipped dispatch — reported as not delivered.
    expect(result).toBe(false);
    expect(
      globalThis.localStorage.getItem(
        `magic_moment_achieved_${READY_PARAMS.profileId}`
      )
    ).toBeNull();
  });

  it('retries a previously skipped dispatch on a later load', () => {
    setGtag(undefined);
    // First visit: gtag blocked, no marker written.
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);

    // Analytics script loads late on a subsequent visit: the missing marker
    // means the event can still fire.
    setGtag(gtagMock);
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(gtagMock).toHaveBeenCalledOnce();
  });

  it('does not double-fire once a real delivery was recorded', () => {
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(gtagMock).toHaveBeenCalledOnce();
  });

  it('treats a blocked localStorage write as non-fatal after a real dispatch', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    try {
      // The event WAS delivered to gtag; the storage failure only costs a
      // possible future duplicate, never a false delivered claim.
      expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
      expect(gtagMock).toHaveBeenCalledOnce();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('returns false when the profile does not meet the activation bar', () => {
    const result = trackMagicMomentIfReady({
      ...READY_PARAMS,
      releaseCount: 0,
    });

    expect(result).toBe(false);
    expect(gtagMock).not.toHaveBeenCalled();
    expect(
      globalThis.localStorage.getItem(
        `magic_moment_achieved_${READY_PARAMS.profileId}`
      )
    ).toBeNull();
  });
});
