import { describe, expect, it } from 'vitest';
import {
  bulkEventActionDidFullySucceed,
  eventActionDidSucceed,
} from '@/app/app/(shell)/calendar/action-results';
import type {
  BulkEventActionResult,
  EventActionResult,
} from '@/app/app/(shell)/dashboard/tour-dates/events-actions';

describe('calendar action result gates', () => {
  it('allows event invalidation only for successful single-event results', () => {
    expect(eventActionDidSucceed({ ok: true })).toBe(true);

    const unauthorized: EventActionResult = {
      ok: false,
      reason: 'unauthorized',
    };
    const missing: EventActionResult = { ok: false, reason: 'not_found' };

    expect(eventActionDidSucceed(unauthorized)).toBe(false);
    expect(eventActionDidSucceed(missing)).toBe(false);
  });

  it('allows bulk selection clearing only for complete bulk success', () => {
    expect(
      bulkEventActionDidFullySucceed({ ok: true, updated: 2, requested: 2 })
    ).toBe(true);

    const partial: BulkEventActionResult = {
      ok: true,
      updated: 1,
      requested: 2,
    };
    const missing: BulkEventActionResult = {
      ok: false,
      reason: 'not_found',
    };
    const unauthorized: BulkEventActionResult = {
      ok: false,
      reason: 'unauthorized',
    };

    expect(bulkEventActionDidFullySucceed(partial)).toBe(false);
    expect(bulkEventActionDidFullySucceed(missing)).toBe(false);
    expect(bulkEventActionDidFullySucceed(unauthorized)).toBe(false);
  });
});
