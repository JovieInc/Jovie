import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() =>
  vi.fn((_condition: Parameters<PgDialect['sqlToQuery']>[0]) => ({
    orderBy: async () => [],
  }))
);
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where }) }) },
}));

import {
  getConfirmedTourEventsForProfile,
  getUpcomingTourDatesForProfile,
  isMissingTourDatesConfirmationStatusError,
} from '@/lib/tour-dates/queries';

describe('public tour feeds', () => {
  it.each([getUpcomingTourDatesForProfile, getConfirmedTourEventsForProfile])(
    '%s excludes even confirmed non-tour events',
    async load => {
      where.mockClear();
      await load('profile-1');
      // Check the predicate actually handed to Drizzle for both profile and ICS.
      const condition = where.mock.lastCall?.[0];
      if (!condition) throw new Error('Expected a tour visibility filter');
      const query = new PgDialect().sqlToQuery(condition);
      expect(query.sql).toContain('"tour_dates"."event_type" =');
      expect(query.sql).toContain('"tour_dates"."confirmation_status" =');
      expect(query.params).toEqual(
        expect.arrayContaining(['profile-1', 'tour', 'confirmed'])
      );
    }
  );
});

/**
 * Mirrors the prod migration-drift failure (JOV-4857): Drizzle wraps the PG
 * 42703 (undefined_column) error, so the outer message is "Failed query: ..."
 * and the real error lives on `.cause`.
 */
function createMissingConfirmationStatusError() {
  return new Error(
    'Failed query: select count(*) from "tour_dates" where ("tour_dates"."profile_id" = $1 and "tour_dates"."confirmation_status" = $2)',
    {
      cause: {
        code: '42703',
        message: 'column tour_dates.confirmation_status does not exist',
      },
    }
  );
}

describe('isMissingTourDatesConfirmationStatusError', () => {
  it('matches the missing confirmation_status column drift (JOV-4857)', () => {
    expect(
      isMissingTourDatesConfirmationStatusError(
        createMissingConfirmationStatusError()
      )
    ).toBe(true);
  });

  it('does not match unrelated missing columns', () => {
    expect(
      isMissingTourDatesConfirmationStatusError(
        new Error('column waitlist_settings.gate_enabled does not exist', {
          cause: { code: '42703' },
        })
      )
    ).toBe(false);
  });

  it('does not match generic errors', () => {
    expect(isMissingTourDatesConfirmationStatusError(new Error('boom'))).toBe(
      false
    );
    expect(isMissingTourDatesConfirmationStatusError(undefined)).toBe(false);
  });
});
