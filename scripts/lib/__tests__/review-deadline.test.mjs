import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertReviewDeadline,
  REVIEW_DEADLINE_GRACE_MS,
  reviewDeadlineStatus,
} from '../review-deadline.mjs';

const deadline = '2026-10-21T15:21:25Z';
const at = iso => Date.parse(iso);
const review = {
  label: 'alias graduation',
  deadline,
  trackingIssue: 'JOV-8338',
};

describe('review deadlines (warn for 72h, then fail)', () => {
  it('passes before the deadline without warning', () => {
    const warn = vi.fn();
    expect(
      assertReviewDeadline(review, { now: at('2026-10-21T15:00:00Z'), warn })
    ).toBe('current');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns, naming the tracking issue, during the grace period (the 2026-10-21 outage)', () => {
    const warn = vi.fn();
    expect(
      assertReviewDeadline(review, { now: at('2026-10-21T16:19:04Z'), warn })
    ).toBe('grace');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('::warning title=review-deadline-overdue::')
    );
    expect(warn.mock.calls[0][0]).toContain('JOV-8338');
    expect(warn.mock.calls[0][0]).toContain('2026-10-24T15:21:25.000Z');
  });

  it('fails merge groups once the grace period ends, and for unreadable deadlines', () => {
    expect(() =>
      assertReviewDeadline(review, {
        now: at(deadline) + REVIEW_DEADLINE_GRACE_MS,
      })
    ).toThrow(/re-review/);
    expect(reviewDeadlineStatus(Number.NaN)).toBe('expired');
    expect(() =>
      assertReviewDeadline(
        { ...review, trackingIssue: '' },
        { now: at('2026-10-21T15:00:00Z') }
      )
    ).toThrow(/tracking issue/);
  });

  it('keeps committed review deadlines on the helper, never a bare now comparison', () => {
    const repo = resolve(import.meta.dirname, '../../..');
    const bare = text =>
      /(nextReview|reviewAt|reviewBy|review_?deadline)[A-Za-z]*\)?\)?\.toBeGreaterThan(OrEqual)?\(\s*Date\.now\(\)/i.test(
        text
      );
    // Split so this positive control is not itself a committed git-grep hit.
    const sample = [
      'expect(nextReviewAt).toBeGreaterThan(',
      'Date.now());',
    ].join('');
    expect(bare(sample)).toBe(true);
    let hits = '';
    try {
      hits = execFileSync(
        'git',
        [
          '-C',
          repo,
          'grep',
          '-n',
          '-i',
          '-E',
          '(nextReview|reviewAt|reviewBy|review_?deadline)[A-Za-z]*\\)?\\)?\\.toBeGreaterThan(OrEqual)?\\(\\s*Date\\.now\\(\\)',
          '--',
          'scripts',
          'apps/web/tests',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
    } catch (error) {
      // git grep exits 1 when nothing matches.
      if (/** @type {{ status?: number }} */ (error).status !== 1) throw error;
    }
    expect(hits).toBe('');
  });
});
