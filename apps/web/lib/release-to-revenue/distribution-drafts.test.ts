import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockEq } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: mockEq,
  isNotNull: vi.fn(value => ({ isNotNull: value })),
  like: vi.fn((column: unknown, pattern: unknown) => ({ column, pattern })),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie',
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  approveDistributionDraft,
  buildDistributionDrafts,
  DISTRIBUTION_DRAFT_EXPECTED_COUNTS,
  rejectDistributionDraft,
} from './distribution-drafts';
import type { ReleaseToRevenueRunStepOutputs } from './types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

const baseStepOutputs: ReleaseToRevenueRunStepOutputs = {
  releaseId: 'release-1',
  triggerSource: 'catalog',
  triggeredAt: '2026-06-20T08:00:00.000Z',
  designPartner: {
    creatorUsername: 'timwhite',
    creatorProfileId: 'profile-1',
    userId: 'user-1',
    store: { provider: 'printful', scope: 'default' },
    socialAccount: { platform: 'instagram', handle: 'timwhite' },
    smsListId: 'design-partner-sms-fans',
  },
  release: {
    releaseId: 'release-1',
    title: 'Neon Sky',
    artworkUrl: null,
    slug: 'neon-sky',
    smartLinkPath: '/timwhite/neon-sky',
    links: [],
  },
};

function mockOwnedRun(stepOutputs: ReleaseToRevenueRunStepOutputs) {
  const selectLimit = vi.fn().mockResolvedValue([
    {
      id: 'run-1',
      kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
      userId: 'user-1',
      status: 'waiting_for_approval',
      stepOutputs,
    },
  ]);
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  mockDb.select.mockReturnValue({ from: selectFrom });
}

describe('buildDistributionDrafts', () => {
  it('creates 3 social posts on one platform and 1 SMS draft', () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: 'https://jov.ie/timwhite/merch/card-1',
      platform: 'instagram',
      createdAt: '2026-06-20T08:00:00.000Z',
    });

    expect(drafts.items).toHaveLength(DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total);

    const socialPosts = drafts.items.filter(
      item => item.channel === 'social_post'
    );
    const smsDrafts = drafts.items.filter(item => item.channel === 'sms');

    expect(socialPosts).toHaveLength(
      DISTRIBUTION_DRAFT_EXPECTED_COUNTS.socialPosts
    );
    expect(smsDrafts).toHaveLength(DISTRIBUTION_DRAFT_EXPECTED_COUNTS.sms);
    expect(socialPosts.every(post => post.platform === 'instagram')).toBe(true);
    expect(smsDrafts[0]?.body).toContain('Neon Sky');
    expect(smsDrafts[0]?.body).toContain('https://jov.ie/timwhite/neon-sky');
    expect(smsDrafts[0]?.body).toContain(
      'https://jov.ie/timwhite/merch/card-1'
    );
    expect(drafts.items.every(item => item.status === 'pending')).toBe(true);
  });
});

describe('approveDistributionDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches an approved draft without auto-sending pending siblings', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: 'https://jov.ie/timwhite/merch',
      platform: 'instagram',
    });
    const draftToApprove = drafts.items[0];
    mockOwnedRun({
      ...baseStepOutputs,
      distributionDrafts: drafts,
    });

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReturnValue({ set: updateSet });

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: draftToApprove.id,
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.draft.status).toBe('dispatched');
    expect(result.draft.dispatchedAt).toBeTruthy();
    expect(result.runStatus).toBe('waiting_for_approval');

    const persisted = updateSet.mock.calls[0]?.[0] as {
      stepOutputs: ReleaseToRevenueRunStepOutputs;
    };
    const approved = persisted.stepOutputs.distributionDrafts?.items.find(
      item => item.id === draftToApprove.id
    );
    const untouched = persisted.stepOutputs.distributionDrafts?.items.find(
      item => item.id !== draftToApprove.id
    );

    expect(approved?.status).toBe('dispatched');
    expect(untouched?.status).toBe('pending');
  });
});

describe('rejectDistributionDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discards a pending draft without dispatching it', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const draftToReject = drafts.items[1];
    mockOwnedRun({
      ...baseStepOutputs,
      distributionDrafts: drafts,
    });

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReturnValue({ set: updateSet });

    const result = await rejectDistributionDraft({
      runId: 'run-1',
      draftId: draftToReject.id,
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.draft.status).toBe('rejected');
    expect(result.draft.dispatchedAt).toBeUndefined();
  });
});
