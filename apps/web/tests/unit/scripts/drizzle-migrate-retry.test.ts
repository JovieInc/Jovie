import { describe, expect, it } from 'vitest';
import {
  getConnectionRetryDelayMs,
  getMigrationLockRetryLimit,
  isRetryableConnectionError,
  resolveMigrationDatabaseUrl,
} from '../../../scripts/drizzle-migrate';

describe('drizzle-migrate connection retry policy', () => {
  it('uses a direct endpoint for session-sensitive migration locks', () => {
    const direct = resolveMigrationDatabaseUrl(
      'postgres://migration:secret@ep-example-pooler.us-east-1.aws.neon.tech/db?sslmode=require' // trufflehog:ignore
    );

    expect(new URL(direct).hostname).toBe('ep-example.us-east-1.aws.neon.tech');
    expect(new URL(direct).searchParams.get('sslmode')).toBe('require');
  });

  it('retries Neon endpoint-limit failures with exponential backoff', () => {
    const error = new Error(
      'You have exceeded the limit of concurrently active endpoints. Please suspend some endpoints and try again.'
    );

    expect(isRetryableConnectionError(error)).toBe(true);
    expect(getConnectionRetryDelayMs(error, 1)).toBe(5_000);
    expect(getConnectionRetryDelayMs(error, 2)).toBe(10_000);
    expect(getConnectionRetryDelayMs(error, 5)).toBe(30_000);
  });

  it('waits for sibling CI migration runners to release the advisory lock', () => {
    const previousCi = process.env.CI;
    process.env.CI = 'true';

    try {
      expect(getMigrationLockRetryLimit()).toBe(120);
    } finally {
      if (previousCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = previousCi;
      }
    }
  });
});
