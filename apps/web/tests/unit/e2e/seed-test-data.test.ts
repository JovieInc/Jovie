import { describe, expect, it } from 'vitest';
import { isRetryableSeedDatabaseError } from '../../seed-test-data';

describe('seedTestData database retry classifier', () => {
  it('treats Neon password auth failures as retryable', () => {
    const error = new Error(
      "password authentication failed for user 'neondb_owner'"
    );

    expect(isRetryableSeedDatabaseError(error)).toBe(true);
  });

  it('treats wrapped Neon endpoint bootstrap failures as retryable', () => {
    const error = new Error('Failed query');
    error.cause = new Error(
      "The requested endpoint could not be found, or you don't have access to it."
    );

    expect(isRetryableSeedDatabaseError(error)).toBe(true);
  });

  it('does not retry non-transient validation failures', () => {
    const error = new Error('duplicate key value violates unique constraint');

    expect(isRetryableSeedDatabaseError(error)).toBe(false);
  });
});
