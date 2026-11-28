import { describe, expect, it } from 'vitest';

import { mergeQueueStats } from '../shipping-slo.mjs';

const NOW = Date.parse('2026-09-28T00:00:00Z');
const DAY = 86_400_000;
const at = ms => new Date(NOW - DAY + ms).toISOString();

// GitHub stamps the queue's own removal on a successful merge at the same
// second as `merged` or one second before it (104 of 245 merged PRs,
// 2026-11-20..22). That removal is the merge, not an ejection.
describe('mergeQueueStats queue removal on merge', () => {
  it('does not count the removal that a successful merge emits as an ejection', () => {
    const timelines = [
      [
        { type: 'added_to_merge_queue', at: at(0) },
        { type: 'removed_from_merge_queue', at: at(600_000) },
        { type: 'merged', at: at(601_000) },
      ],
      [
        { type: 'added_to_merge_queue', at: at(0) },
        { type: 'removed_from_merge_queue', at: at(300_000) },
        { type: 'merged', at: at(300_000) },
      ],
      [
        { type: 'added_to_merge_queue', at: at(0) },
        { type: 'merged', at: at(900_000) },
        { type: 'removed_from_merge_queue', at: at(900_000) },
      ],
    ];
    const s = mergeQueueStats(timelines, NOW - 7 * DAY, NOW);
    expect(s.enqueued).toBe(3);
    expect(s.ejected).toBe(0);
    expect(s.ejectionRate).toBe(0);
    expect(s.wait.n).toBe(3);
    expect(s.wait.p95).toBe(900);
  });

  it('still counts a real ejection that is followed by a later re-enqueue and merge', () => {
    const s = mergeQueueStats(
      [
        [
          { type: 'added_to_merge_queue', at: at(0) },
          { type: 'removed_from_merge_queue', at: at(600_000) },
          { type: 'added_to_merge_queue', at: at(660_000) },
          { type: 'removed_from_merge_queue', at: at(1_260_000) },
          { type: 'merged', at: at(1_260_000) },
        ],
      ],
      NOW - 7 * DAY,
      NOW
    );
    expect(s.enqueued).toBe(2);
    expect(s.ejected).toBe(1);
    expect(s.wait.n).toBe(1);
    expect(s.wait.p95).toBe(600);
  });
});
