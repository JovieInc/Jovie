// Review deadlines in committed receipts are forcing functions: a policy that
// is not re-reviewed must not stay green forever. A hard `deadline > now`
// assertion, though, turned the deadline into a queue-wide outage: on
// 2026-10-21 the JOV-8338 alias-graduation receipt passed its 15:21Z review
// date and every merge group failed until it was refreshed.
//
// assertReviewDeadline keeps the forcing function but adds a grace period:
// before the deadline it passes; for REVIEW_DEADLINE_GRACE_MS after it, it
// passes with a CI warning annotation that names the tracking issue; after
// the grace period it fails, as before.

export const REVIEW_DEADLINE_GRACE_MS = 72 * 60 * 60 * 1000;

/** @returns {'current' | 'grace' | 'expired'} */
export function reviewDeadlineStatus(
  deadlineMs,
  nowMs = Date.now(),
  graceMs = REVIEW_DEADLINE_GRACE_MS
) {
  if (!Number.isFinite(deadlineMs)) return 'expired';
  if (nowMs < deadlineMs) return 'current';
  return nowMs < deadlineMs + graceMs ? 'grace' : 'expired';
}

/**
 * @param {{ label: string, deadline: string, trackingIssue: string }} review
 * @param {{ now?: number, graceMs?: number, warn?: (line: string) => void }} [options]
 */
export function assertReviewDeadline(review, options = {}) {
  const now = options.now ?? Date.now();
  const graceMs = options.graceMs ?? REVIEW_DEADLINE_GRACE_MS;
  const deadlineMs = Date.parse(review.deadline);
  const status = reviewDeadlineStatus(deadlineMs, now, graceMs);
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(review.trackingIssue ?? '')) {
    throw new Error(`${review.label}: review deadline needs a tracking issue`);
  }
  if (status === 'current') return status;
  const failsAt = Number.isFinite(deadlineMs)
    ? new Date(deadlineMs + graceMs).toISOString()
    : 'now';
  if (status === 'grace') {
    (options.warn ?? (line => console.warn(line)))(
      `::warning title=review-deadline-overdue::${review.label} review was due ${review.deadline} (${review.trackingIssue}); merge groups fail after ${failsAt}.`
    );
    return status;
  }
  throw new Error(
    `${review.label} review was due ${review.deadline} (${review.trackingIssue}) and its ${graceMs / 3_600_000}h grace ended ${failsAt}; re-review and refresh it.`
  );
}
