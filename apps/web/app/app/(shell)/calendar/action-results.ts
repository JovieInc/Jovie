import type {
  BulkEventActionResult,
  EventActionResult,
} from '@/app/app/(shell)/dashboard/tour-dates/events-actions';

export function eventActionDidSucceed(
  result: EventActionResult
): result is Extract<EventActionResult, { ok: true }> {
  return result.ok;
}

export function bulkEventActionDidFullySucceed(
  result: BulkEventActionResult
): result is Extract<BulkEventActionResult, { ok: true }> {
  return result.ok && result.updated === result.requested;
}
