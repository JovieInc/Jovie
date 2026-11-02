import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureException: vi.fn(),
  trackEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureException,
  getClient: vi.fn(() => undefined),
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: hoisted.trackEvent,
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: vi.fn(() => 'full'),
  isSentryInitialized: vi.fn(() => true),
}));

const { captureWarning } = await import('@/lib/error-tracking');

describe('error-tracking capture suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not file Sentry for the expected owner verified-merge guard receipt (JOV-10124 / Sentry 7822218012)', async () => {
    await captureWarning(
      'Owner identity requires an explicit verified profile merge',
      undefined,
      {
        source: 'spotify_release_credit',
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collision: 'registry',
      }
    );

    expect(hoisted.captureException).not.toHaveBeenCalled();
    // The receipt is still observable through the always-on console warning
    // and the analytics event — only the Sentry filing is suppressed.
    expect(hoisted.trackEvent).toHaveBeenCalledWith(
      '$exception',
      expect.objectContaining({
        error_message:
          'Owner identity requires an explicit verified profile merge',
        error_severity: 'warning',
        source: 'spotify_release_credit',
        collision: 'registry',
      }),
      undefined
    );
  });

  it('still files Sentry for unexpected spotify_release_credit warnings', async () => {
    await captureWarning(
      'Credited artist profile identity conflicts detected',
      undefined,
      {
        source: 'spotify_release_credit',
        creatorProfileId: 'owner-profile',
        conflicted: 1,
      }
    );

    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('still files Sentry for unexpected warnings outside the reconciliation source', async () => {
    await captureWarning('Unrelated component degraded', new Error('boom'), {
      source: 'other_source',
    });

    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
  });
});
