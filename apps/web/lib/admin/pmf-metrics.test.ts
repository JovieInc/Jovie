import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { getPmfMetrics } from './pmf-metrics';

describe('getPmfMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the aggregate row to activation and survey rates', async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          admitted_users: '40',
          activated_users: '10',
          survey_responses: '5',
          very_disappointed: '3',
        },
      ],
    });

    const metrics = await getPmfMetrics();

    expect(metrics).toMatchObject({
      admittedUsers: 40,
      activatedUsers: 10,
      activationRate: 0.25,
      surveyResponses: 5,
      veryDisappointed: 3,
      veryDisappointedRate: 0.6,
      meetsTarget: true,
    });
  });

  it('counts admitted users, the shared activation predicate and only answered rows', async () => {
    mocks.execute.mockResolvedValue({ rows: [{}] });
    await getPmfMetrics();
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain('cp.onboarding_completed_at IS NOT NULL');
    expect(query.sql).toContain('r.answered_at IS NOT NULL');
    expect(query.sql).toContain('u.deleted_at IS NULL');
    expect(query.params).toEqual(
      expect.arrayContaining([
        'waitlist_approved',
        'profile_claimed',
        'onboarding_incomplete',
        'active',
      ])
    );
    expect(query.params).not.toContain('waitlist_pending');
  });

  it('returns null, never zeros, when the read fails', async () => {
    mocks.execute.mockRejectedValue(new Error('db down'));
    await expect(getPmfMetrics()).resolves.toBeNull();
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
