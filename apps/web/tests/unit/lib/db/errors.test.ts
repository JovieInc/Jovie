import { describe, expect, it } from 'vitest';
import { isUniqueViolation, unwrapPgError } from '@/lib/db/errors';

describe('unwrapPgError', () => {
  it('extracts fields from a raw PG error', () => {
    const error = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'my_unique_idx',
      detail: 'Key (col)=(val) already exists.',
    });

    const result = unwrapPgError(error);
    expect(result.code).toBe('23505');
    expect(result.constraint).toBe('my_unique_idx');
    expect(result.detail).toContain('already exists');
  });

  it('unwraps Drizzle .cause wrapper', () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'creator_profiles_spotify_id_unique',
    });
    const drizzleError = new Error(
      'Failed query: update "creator_profiles"...'
    );
    drizzleError.cause = pgError;

    const result = unwrapPgError(drizzleError);
    expect(result.code).toBe('23505');
    expect(result.constraint).toBe('creator_profiles_spotify_id_unique');
  });

  it('unwraps .sourceError wrapper (Neon pattern)', () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'my_constraint',
    });
    const wrapper = Object.assign(new Error('query failed'), {
      sourceError: pgError,
    });

    const result = unwrapPgError(wrapper);
    expect(result.code).toBe('23505');
    expect(result.constraint).toBe('my_constraint');
  });

  it('unwraps deeply nested .cause chain', () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'deep_constraint',
    });
    const inner = new Error('inner wrapper');
    inner.cause = pgError;
    const outer = new Error('outer wrapper');
    outer.cause = inner;

    const result = unwrapPgError(outer);
    expect(result.code).toBe('23505');
    expect(result.constraint).toBe('deep_constraint');
  });

  it('returns empty fields for non-PG errors', () => {
    const error = new Error('something went wrong');

    const result = unwrapPgError(error);
    expect(result.code).toBeNull();
    expect(result.constraint).toBeNull();
  });

  it('handles null/undefined gracefully', () => {
    expect(unwrapPgError(null).code).toBeNull();
    expect(unwrapPgError(undefined).code).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  it('detects raw PG unique violation', () => {
    const error = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'my_idx',
    });

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, 'my_idx')).toBe(true);
    expect(isUniqueViolation(error, 'other_idx')).toBe(false);
  });

  it('detects Drizzle-wrapped unique violation', () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'creator_profiles_spotify_id_unique',
    });
    const drizzleError = new Error('Failed query: update...');
    drizzleError.cause = pgError;

    expect(isUniqueViolation(drizzleError)).toBe(true);
    expect(
      isUniqueViolation(drizzleError, 'creator_profiles_spotify_id_unique')
    ).toBe(true);
    expect(isUniqueViolation(drizzleError, 'other_constraint')).toBe(false);
  });

  it('returns false for non-unique-violation PG errors', () => {
    const error = Object.assign(new Error('not null violation'), {
      code: '23502',
    });

    expect(isUniqueViolation(error)).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isUniqueViolation('string error')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
  });

  it('matches constraint in message when constraint field is missing', () => {
    const pgError = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "creator_profiles_spotify_id_unique"'
      ),
      { code: '23505' }
    );
    const drizzleError = new Error('Failed query...');
    drizzleError.cause = pgError;

    expect(
      isUniqueViolation(drizzleError, 'creator_profiles_spotify_id_unique')
    ).toBe(true);
  });

  it('matches constraint in detail when constraint field is missing', () => {
    const pgError = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        code: '23505',
        detail:
          'Key (spotify_id)=(abc) already exists on creator_profiles_spotify_id_unique.',
      }
    );

    expect(
      isUniqueViolation(pgError, 'creator_profiles_spotify_id_unique')
    ).toBe(true);
  });
});
