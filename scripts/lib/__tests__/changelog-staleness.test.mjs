import { describe, expect, it } from 'vitest';
import { evaluateChangelogStaleness } from '../changelog-staleness.mjs';

const now = '2026-10-29T12:00:00Z';
describe('evaluateChangelogStaleness', () => {
  it('is ok when nothing release-worthy is waiting', () => {
    expect(
      evaluateChangelogStaleness({ liveWorthy: [], lastPublishedAt: null, now })
        .status
    ).toBe('ok');
  });
  it('is ok inside the 24h window', () => {
    const result = evaluateChangelogStaleness({
      liveWorthy: [{ number: 1, mergedAt: '2026-10-29T00:00:00Z' }],
      lastPublishedAt: '2026-10-24T00:00:00Z',
      now,
    });
    expect(result).toMatchObject({ status: 'ok', waiting: 1 });
  });
  it('is stale past 24h with no later entry', () => {
    const result = evaluateChangelogStaleness({
      liveWorthy: [
        { number: 2, mergedAt: '2026-10-27T00:00:00Z' },
        { number: 1, mergedAt: '2026-10-26T00:00:00Z' },
      ],
      lastPublishedAt: '2026-10-24T00:00:00Z',
      now,
    });
    expect(result).toMatchObject({ status: 'stale', waiting: 2, oldestPr: 1 });
  });
  it('ignores changes merged before the last publication', () => {
    const result = evaluateChangelogStaleness({
      liveWorthy: [{ number: 1, mergedAt: '2026-10-20T00:00:00Z' }],
      lastPublishedAt: '2026-10-24T00:00:00Z',
      now,
    });
    expect(result.status).toBe('ok');
  });
});
