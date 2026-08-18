import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((_col, val) => ({ gte: val })),
}));

vi.mock('@/lib/tour-dates/view-model', () => ({
  mapTourDateToViewModel: vi.fn((row: unknown) => row),
}));

import { isMissingTourDatesConfirmationStatusError } from '@/lib/tour-dates/queries';

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
