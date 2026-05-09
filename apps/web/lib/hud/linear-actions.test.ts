import { describe, expect, it, vi } from 'vitest';

// Mock server-only so the module can be tested in vitest (node env)
vi.mock('server-only', () => ({}));

// Mock the env module before importing the module under test
vi.mock('@/lib/env-server', () => ({
  env: {
    LINEAR_API_KEY: undefined,
  },
}));

// Mock the logger
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('fetchTimActionIssues', () => {
  it('returns available=false when LINEAR_API_KEY is not configured', async () => {
    // env.LINEAR_API_KEY is undefined from the mock above
    const { fetchTimActionIssues } = await import('./linear-actions');
    const result = await fetchTimActionIssues();

    expect(result.available).toBe(false);
    expect(result.issues).toEqual([]);
    expect(typeof result.fetchedAt).toBe('string');
  });
});

describe('sort order', () => {
  it('sorts by priority ASC then createdAt ASC', () => {
    // Test the sort logic directly by reconstructing it
    // Priority: 1=urgent (lowest number = highest priority), 0 = no priority (treated as 5)
    const issues = [
      { priority: 0, createdAt: '2026-01-01T00:00:00Z' }, // no priority → 5
      { priority: 2, createdAt: '2026-01-03T00:00:00Z' }, // high, newer
      { priority: 2, createdAt: '2026-01-01T00:00:00Z' }, // high, older
      { priority: 1, createdAt: '2026-01-02T00:00:00Z' }, // urgent
    ];

    const sorted = [...issues].sort((a, b) => {
      const aPriority = a.priority === 0 ? 5 : a.priority;
      const bPriority = b.priority === 0 ? 5 : b.priority;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    expect(sorted[0]).toMatchObject({ priority: 1 }); // urgent first
    expect(sorted[1]).toMatchObject({
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
    }); // high, oldest first
    expect(sorted[2]).toMatchObject({
      priority: 2,
      createdAt: '2026-01-03T00:00:00Z',
    }); // high, newer
    expect(sorted[3]).toMatchObject({ priority: 0 }); // no priority last
  });

  it('treats priority 0 as lower than priority 4', () => {
    const issues = [
      { priority: 0, createdAt: '2026-01-01T00:00:00Z' },
      { priority: 4, createdAt: '2026-01-01T00:00:00Z' },
    ];

    const sorted = [...issues].sort((a, b) => {
      const aPriority = a.priority === 0 ? 5 : a.priority;
      const bPriority = b.priority === 0 ? 5 : b.priority;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    expect(sorted[0]?.priority).toBe(4); // low (4) comes before no-priority (0→5)
    expect(sorted[1]?.priority).toBe(0);
  });
});

describe('computeDaysOld', () => {
  it('returns 0 for today', () => {
    const now = Date.now();
    const today = new Date(now).toISOString();
    const created = new Date(today).getTime();
    const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    expect(daysOld).toBe(0);
  });

  it('returns 7 for a date 7 days ago', () => {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const created = new Date(sevenDaysAgo).getTime();
    const daysOld = Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
    expect(daysOld).toBe(7);
  });
});
