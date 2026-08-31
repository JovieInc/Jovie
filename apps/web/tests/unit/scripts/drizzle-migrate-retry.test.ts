import { describe, expect, it } from 'vitest';
import {
  buildMigrationAdvisoryLockStatements,
  getConnectionRetryDelayMs,
  isRetryableConnectionError,
} from '../../../scripts/drizzle-migrate';

describe('drizzle-migrate connection retry policy', () => {
  it('retries Neon endpoint-limit failures with exponential backoff', () => {
    const error = new Error(
      'You have exceeded the limit of concurrently active endpoints. Please suspend some endpoints and try again.'
    );

    expect(isRetryableConnectionError(error)).toBe(true);
    expect(getConnectionRetryDelayMs(error, 1)).toBe(5_000);
    expect(getConnectionRetryDelayMs(error, 2)).toBe(10_000);
    expect(getConnectionRetryDelayMs(error, 5)).toBe(30_000);
  });

  it('serializes migration runners with a database-scoped advisory lock', () => {
    const statements = buildMigrationAdvisoryLockStatements();

    expect(statements.lock.sql).toContain('pg_advisory_lock');
    expect(statements.unlock.sql).toContain('pg_advisory_unlock');
    expect(statements.lock.sql).toContain('hashtext($1::text)');
    expect(statements.lock.sql).toContain('hashtext(current_database())');
    expect(statements.lock.values).toEqual(['jovie:drizzle:migrate']);
    expect(statements.unlock.values).toEqual(statements.lock.values);
  });
});
