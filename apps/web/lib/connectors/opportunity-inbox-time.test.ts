import { describe, expect, it } from 'vitest';
import { formatOpportunityInboxRelativeTime } from './opportunity-inbox-time';

describe('formatOpportunityInboxRelativeTime', () => {
  it('formats recent timestamps as relative time', () => {
    const now = Date.parse('2026-06-28T12:00:00.000Z');
    expect(
      formatOpportunityInboxRelativeTime('2026-06-28T10:00:00.000Z', now)
    ).toBe('2 hours ago');
  });

  it('returns a stable fallback for invalid timestamps', () => {
    expect(formatOpportunityInboxRelativeTime('not-a-date')).toBe('Recently');
  });
});
