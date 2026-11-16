import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  inArray: vi.fn((column: unknown, values: readonly string[]) => ({
    column,
    values,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  inArray: mocks.inArray,
}));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));

import {
  countOpenBugReports,
  readSupportLoadCapacity,
} from '@/lib/waitlist/support-load.server';

describe('support load reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue([{ open: 0 }]);
  });

  it('counts only dispositions that still need work', async () => {
    await countOpenBugReports();
    const values = mocks.inArray.mock.calls[0]?.[1];
    expect(values).toEqual([
      'pending',
      'pending_summer',
      'cert_required',
      'now',
    ]);
    expect(values).not.toContain('auto_remediation');
    expect(values).not.toContain('duplicate');
  });

  it('returns null when the count is unreadable', async () => {
    mocks.where.mockRejectedValue(new Error('db down'));
    expect(await countOpenBugReports()).toBeNull();
  });

  it('reports the effective budget the gate spends', async () => {
    mocks.where.mockResolvedValue([{ open: 5 }]);
    expect(
      await readSupportLoadCapacity({
        autoAcceptDailyLimit: 10,
        autoAcceptedToday: 2,
      })
    ).toEqual({ band: 'narrow', dailyLimit: 5, remaining: 3 });
  });
});
