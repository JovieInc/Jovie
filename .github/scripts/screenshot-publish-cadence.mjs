#!/usr/bin/env node
// Decides whether the Product Screenshots publish step may open a NEW
// screenshots/auto-update PR. Each new PR costs a merge-queue slot and a full CI
// run (22 merged in 3 days, 2026-10-23..25). Updating an already-open PR costs
// no new slot, so it is always allowed. A new PR is allowed only once the
// previous one merged at least WINDOW_HOURS ago, so refreshes batch to <= 1/day.
// Pure and fail-open: malformed input publishes (a missed refresh is worse than
// one extra PR).
import { pathToFileURL } from 'node:url';

export const SCREENSHOT_PUBLISH_WINDOW_HOURS = 24;

export function decideScreenshotPublish({
  openPrNumber = null,
  lastMergedAt = null,
  now = new Date().toISOString(),
  windowHours = SCREENSHOT_PUBLISH_WINDOW_HOURS,
} = {}) {
  if (Number.isSafeInteger(Number(openPrNumber)) && Number(openPrNumber) > 0) {
    return { publish: true, reason: 'update_open_pr', slotSaved: false };
  }
  const merged = Date.parse(lastMergedAt ?? '');
  const current = Date.parse(now);
  if (!Number.isFinite(merged) || !Number.isFinite(current)) {
    return {
      publish: true,
      reason: 'no_prior_merge_or_bad_time',
      slotSaved: false,
    };
  }
  const ageHours = (current - merged) / 3_600_000;
  if (ageHours < windowHours) {
    return {
      publish: false,
      reason: 'batched_within_window',
      ageHours: Math.round(ageHours * 10) / 10,
      slotSaved: true,
    };
  }
  return { publish: true, reason: 'window_elapsed', slotSaved: false };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [openPr, lastMergedAt] = process.argv.slice(2);
  const result = decideScreenshotPublish({
    openPrNumber: openPr || null,
    lastMergedAt: lastMergedAt || null,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
