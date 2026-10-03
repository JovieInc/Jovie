import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN } from '@/lib/utils/email';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  where: vi.fn(),
  exists: vi.fn(),
  markdown: vi.fn(),
  registry: vi.fn(),
  build: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  doesTableExist: mocks.exists,
  TABLE_NAMES: {
    creatorProfiles: 'creator_profiles',
    dailyProfileViews: 'daily_profile_views',
    clickEvents: 'click_events',
  },
}));
vi.mock('./feature-registry-source', () => ({
  loadFeatureRegistryMarkdown: mocks.markdown,
}));
vi.mock('./founder-review-registry', () => ({
  buildFeatureReviewItems: mocks.registry,
}));
vi.mock('@/lib/observability/build-info', () => ({
  getDeployedBuildInfo: mocks.build,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.error }));

import { loadCapabilityEvidence } from './capability-evidence';

const now = new Date('2026-10-03T12:00:00.000Z');
const certification = {
  title: 'Public profile pages',
  id: 'feature.profile.canonical',
  gate: 'None',
  certificationState: 'review_ready',
  readiness: 'ready',
  decisionEvidenceDigest: 'a'.repeat(40),
  source: 'docs/FEATURE_REGISTRY.md',
};

describe('loadCapabilityEvidence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.exists.mockResolvedValue(true);
    mocks.markdown.mockResolvedValue('canonical registry');
    mocks.registry.mockReturnValue([certification]);
    mocks.build.mockResolvedValue({
      commitSha: 'b'.repeat(40),
      version: '1.2.3',
      environment: 'production',
      deploymentId: 'deployment-1',
    });
    mocks.where.mockResolvedValue([{ count: 12, latest: '2026-10-02' }]);
    mocks.select.mockImplementation(() => {
      const query = {
        from: vi.fn(),
        innerJoin: vi.fn(),
        leftJoin: vi.fn(),
        where: mocks.where,
      };
      query.from.mockReturnValue(query);
      query.innerJoin.mockReturnValue(query);
      query.leftJoin.mockReturnValue(query);
      return query;
    });
  });

  it('binds canonical certification and deployment to scoped customer observations', async () => {
    const result = await loadCapabilityEvidence(now);
    expect(result).toMatchObject({
      subjectId: certification.id,
      clientSha: null,
      generatedAt: now.toISOString(),
      deployment: { commitSha: 'b'.repeat(40) },
      exposure: { measured: true, count: 12, stale: false },
      outcome: { measured: true, count: 12 },
    });
    expect(mocks.registry).toHaveBeenCalledWith('canonical registry');
    const queries = mocks.where.mock.calls.map(([condition]) =>
      new PgDialect().sqlToQuery(condition)
    );
    for (const query of queries) {
      expect(query.sql).toContain('"creator_profiles"."is_public"');
      expect(query.sql).toContain('"creator_profiles"."is_claimed"');
      expect(query.sql).toContain('lower("users"."email") !~*');
      expect(query.params).toContain(INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN);
      expect(query.params).toContain(7);
    }
    expect(queries[1].sql).toContain('"click_events"."is_bot"');
    expect(queries[1].params).toContain(false);
  });

  it('keeps missing tables unmeasured and never queries them', async () => {
    mocks.exists.mockResolvedValue(false);
    const result = await loadCapabilityEvidence(now);
    expect(result.exposure).toMatchObject({
      measured: false,
      count: null,
      error: null,
    });
    expect(result.outcome).toMatchObject({
      measured: false,
      count: null,
      error: null,
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('distinguishes failed queries from valid empty observations', async () => {
    mocks.where
      .mockRejectedValueOnce(new Error('read unavailable'))
      .mockResolvedValueOnce([]);
    const result = await loadCapabilityEvidence(now);
    expect(result.exposure).toMatchObject({
      measured: false,
      count: null,
      error: 'read unavailable',
    });
    expect(result.outcome).toMatchObject({
      measured: true,
      count: 0,
      latestAt: null,
      stale: true,
      error: null,
    });
    expect(mocks.error).toHaveBeenCalledWith(
      'capability evidence: profile exposure read failed',
      expect.any(Error)
    );
  });

  it('preserves stale exposure and fails closed when certification is unreadable', async () => {
    mocks.markdown.mockRejectedValue(new Error('registry unavailable'));
    mocks.where.mockResolvedValue([{ count: 12, latest: 'invalid-date' }]);
    mocks.build.mockResolvedValue({ version: '' });
    const result = await loadCapabilityEvidence(now);
    expect(result).toMatchObject({
      certification: null,
      clientSha: null,
      exposure: { stale: true },
      deployment: {
        commitSha: null,
        version: null,
        environment: null,
        deploymentId: null,
      },
    });
    expect(mocks.error).toHaveBeenCalledWith(
      'capability evidence: registry certification read failed',
      expect.any(Error)
    );
  });

  it.each([
    ['25%', 25],
    ['101%', null],
    ['profile-capability', null],
  ])(
    'preserves configured rollout %s without guessing',
    async (gate, percent) => {
      mocks.registry.mockReturnValue([{ ...certification, gate }]);
      expect((await loadCapabilityEvidence(now)).rollout).toEqual({
        gate,
        configuredPercent: percent,
      });
    }
  );
});
