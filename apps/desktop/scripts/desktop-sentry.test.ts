import { describe, expect, it } from 'vitest';
import {
  desktopSentryRelease,
  redactDesktopEvent,
  resolveDesktopSentryOptions,
  SENTRY_SYNTHETIC_FLAG,
  wantsSyntheticSentryError,
} from '../src/desktop-sentry';

const base = {
  dsn: 'https://k@o0.ingest.sentry.io/1',
  appEnv: 'production' as const,
  version: '26.10.16',
  sourceRevision: 'a'.repeat(40),
};

describe('desktop sentry options', () => {
  it('is off without a DSN and for local dev builds', () => {
    expect(resolveDesktopSentryOptions({ ...base, dsn: '' })).toBeNull();
    expect(
      resolveDesktopSentryOptions({ ...base, appEnv: 'local' })
    ).toBeNull();
  });

  it('uses the desktop version as release and the channel as environment', () => {
    const options = resolveDesktopSentryOptions({ ...base, appEnv: 'staging' });
    expect(options).toMatchObject({
      release: desktopSentryRelease('26.10.16'),
      dist: 'a'.repeat(12),
      environment: 'staging',
      sendDefaultPii: false,
    });
    expect(options?.release).toBe('jovie-desktop@26.10.16');
  });

  it('omits dist when provenance has no revision', () => {
    expect(
      resolveDesktopSentryOptions({ ...base, sourceRevision: null })
    ).not.toHaveProperty('dist');
  });

  it('strips user, host and request data before send', () => {
    const event = redactDesktopEvent({
      user: { email: 'a@b.c' },
      server_name: 'tims-mac',
      request: { cookies: 1, data: 2, headers: { a: 'b' } },
    });
    expect(event).toEqual({ request: {} });
  });

  it('detects the synthetic-error launch flag', () => {
    expect(wantsSyntheticSentryError(['Jovie', SENTRY_SYNTHETIC_FLAG])).toBe(
      true
    );
    expect(wantsSyntheticSentryError(['Jovie'])).toBe(false);
  });
});
