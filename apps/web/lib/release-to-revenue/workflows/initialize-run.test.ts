import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeConnectReadiness } from '@/lib/stripe/connect-readiness';

const {
  mockDb,
  mockEq,
  mockMarkWorkflowFailed,
  mockGetStripeConnectReadiness,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  mockMarkWorkflowFailed: vi.fn(),
  mockGetStripeConnectReadiness: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: mockEq,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/connectors', () => ({
  workflowRuns: { __table: 'workflow_runs' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { __table: 'creator_profiles' },
}));

vi.mock('@/lib/connectors/workflows/execute-approved-action', () => ({
  markWorkflowFailed: mockMarkWorkflowFailed,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/stripe/connect-readiness', () => ({
  getStripeConnectReadiness: mockGetStripeConnectReadiness,
  // Mirrors the real fail-closed predicate; the predicate itself is covered
  // by lib/stripe/connect-readiness.test.ts.
  isStripeConnectChargesReady: (readiness: StripeConnectReadiness | null) =>
    readiness !== null &&
    readiness.source !== 'cache-stale-stripe-failed' &&
    readiness.chargesEnabled === true &&
    readiness.payoutsEnabled === true &&
    readiness.detailsSubmitted === true,
}));

const { mockGenerateDistributionDraftsForRun } = vi.hoisted(() => ({
  mockGenerateDistributionDraftsForRun: vi.fn(),
}));

vi.mock('../distribution-drafts', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../distribution-drafts')>();
  return {
    ...actual,
    generateDistributionDraftsForRun: mockGenerateDistributionDraftsForRun,
  };
});

import { creatorProfiles } from '@/lib/db/schema/profiles';
import { DISTRIBUTION_DRAFT_EXPECTED_COUNTS } from '../distribution-drafts';

const mockSyncStoreListingForRun = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ merchCardIds: ['card-1'] })
);

vi.mock('../store-listing', () => ({
  syncStoreListingForRun: mockSyncStoreListingForRun,
  // Mirrors the real normalizeStoreListing (dedupe + drop empty ids); the real
  // implementation is covered by store-listing.test.ts.
  normalizeStoreListing: (
    storeListing: { merchCardIds?: readonly string[] } | undefined
  ) => ({
    merchCardIds: [
      ...new Set(
        (storeListing?.merchCardIds ?? []).filter(
          (id: string) => id.trim().length > 0
        )
      ),
    ],
  }),
}));

import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '../types';
import { initializeReleaseToRevenueRun } from './initialize-run';

const READY: StripeConnectReadiness = {
  stripeAccountId: 'acct_ready',
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  onboardingComplete: true,
  payoutEmail: 'payouts@example.com',
  lastSyncedAt: new Date(),
  source: 'stripe',
};

function buildStepOutputs(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    releaseId: 'release-1',
    release: { title: 'Launch Track' },
    designPartner: {
      creatorUsername: 'timwhite',
      creatorProfileId: 'profile-1',
      userId: 'user-1',
      store: { provider: 'printful', scope: 'default' },
      socialAccount: { platform: 'instagram', handle: 'timwhite' },
      smsListId: 'design-partner-sms-fans',
    },
    ...overrides,
  };
}

/**
 * Route `db.select(...)` calls by the `.from()` table so the workflow run
 * lookup and the creator-profile Connect-account lookup resolve different
 * rows.
 */
function mockSelectRouting(input: {
  readonly runRows: unknown[];
  readonly profileRows?: unknown[];
}) {
  mockDb.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () =>
          Promise.resolve(
            table === creatorProfiles
              ? (input.profileRows ?? [])
              : input.runRows
          ),
      }),
    }),
  }));
}

function mockUpdateResolving() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  mockDb.update.mockReturnValue({ set: updateSet });
  return { updateSet, updateWhere };
}

describe('initializeReleaseToRevenueRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncStoreListingForRun.mockResolvedValue({
      merchCardIds: ['card-1'],
    });
    mockGetStripeConnectReadiness.mockResolvedValue(READY);
    mockGenerateDistributionDraftsForRun.mockResolvedValue({
      releaseLink: 'https://jov.ie/timwhite/launch-track',
      merchDropLink: 'https://jov.ie/timwhite/merch',
      items: Array.from(
        { length: DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total },
        (_, index) => ({
          id: `draft-${index}`,
          channel:
            index < DISTRIBUTION_DRAFT_EXPECTED_COUNTS.socialPosts
              ? 'social_post'
              : 'sms',
          platform:
            index < DISTRIBUTION_DRAFT_EXPECTED_COUNTS.socialPosts
              ? 'instagram'
              : 'sms',
          variant: 'announcement',
          body: `Draft ${index}`,
          status: 'pending',
          createdAt: '2026-06-20T08:00:00.000Z',
        })
      ),
    });
  });

  it('marks valid runs as waiting_for_approval', async () => {
    const stepOutputs = buildStepOutputs();
    mockSelectRouting({
      runRows: [
        {
          id: 'run-1',
          kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
          stepOutputs,
        },
      ],
      profileRows: [{ stripeAccountId: 'acct_ready' }],
    });
    const { updateSet } = mockUpdateResolving();

    await initializeReleaseToRevenueRun({ workflowRunId: 'run-1' });

    expect(mockGetStripeConnectReadiness).toHaveBeenCalledWith('acct_ready');
    expect(mockSyncStoreListingForRun).toHaveBeenCalledWith({
      workflowRunId: 'run-1',
      stepOutputs,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'waiting_for_approval',
        currentStep: 'awaiting_approval',
        stepOutputs: expect.objectContaining({
          distributionDrafts: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ status: 'pending' }),
            ]),
          }),
          storeListing: { merchCardIds: ['card-1'] },
        }),
      })
    );
    expect(
      updateSet.mock.calls[0]?.[0].stepOutputs.distributionDrafts.items
    ).toHaveLength(DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total);
    expect(mockMarkWorkflowFailed).not.toHaveBeenCalled();
  });

  it('fails when release metadata is missing', async () => {
    mockSelectRouting({
      runRows: [
        {
          id: 'run-2',
          kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
          stepOutputs: { releaseId: null },
        },
      ],
    });

    await initializeReleaseToRevenueRun({ workflowRunId: 'run-2' });

    expect(mockMarkWorkflowFailed).toHaveBeenCalledWith(
      'run-2',
      'release_to_revenue run is missing release metadata'
    );
    expect(mockSyncStoreListingForRun).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'creator profile has no Stripe account',
      profileRows: [{ stripeAccountId: null }],
      readiness: READY,
      expectReadinessCall: false,
    },
    {
      name: 'creator profile row is missing',
      profileRows: [],
      readiness: READY,
      expectReadinessCall: false,
    },
    {
      name: 'readiness is unresolvable for the account',
      profileRows: [{ stripeAccountId: 'acct_x' }],
      readiness: null,
      expectReadinessCall: true,
    },
    {
      name: 'charges are not enabled',
      profileRows: [{ stripeAccountId: 'acct_x' }],
      readiness: { ...READY, chargesEnabled: false },
      expectReadinessCall: true,
    },
    {
      name: 'payouts are not enabled',
      profileRows: [{ stripeAccountId: 'acct_x' }],
      readiness: { ...READY, payoutsEnabled: false },
      expectReadinessCall: true,
    },
    {
      name: 'details were never submitted',
      profileRows: [{ stripeAccountId: 'acct_x' }],
      readiness: { ...READY, detailsSubmitted: false },
      expectReadinessCall: true,
    },
    {
      name: 'readiness came back from a stale cache that failed refresh',
      profileRows: [{ stripeAccountId: 'acct_x' }],
      readiness: { ...READY, source: 'cache-stale-stripe-failed' as const },
      expectReadinessCall: true,
    },
  ])(
    'marks only the selling step connect-not-ready when $name',
    async ({ profileRows, readiness, expectReadinessCall }) => {
      mockSelectRouting({
        runRows: [
          {
            id: 'run-3',
            kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
            stepOutputs: buildStepOutputs(),
          },
        ],
        profileRows,
      });
      mockGetStripeConnectReadiness.mockResolvedValue(readiness);
      const { updateSet } = mockUpdateResolving();

      await initializeReleaseToRevenueRun({ workflowRunId: 'run-3' });

      expect(mockSyncStoreListingForRun).not.toHaveBeenCalled();
      if (expectReadinessCall) {
        expect(mockGetStripeConnectReadiness).toHaveBeenCalledWith('acct_x');
      } else {
        expect(mockGetStripeConnectReadiness).not.toHaveBeenCalled();
      }
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'waiting_for_approval',
          stepOutputs: expect.objectContaining({
            storeListing: {
              merchCardIds: [],
              status: 'connect-not-ready',
            },
          }),
        })
      );
      // Non-payment work still runs: distribution drafts are generated.
      expect(mockGenerateDistributionDraftsForRun).toHaveBeenCalled();
      const written = updateSet.mock.calls[0]?.[0].stepOutputs;
      expect(written.distributionDrafts.items).toHaveLength(
        DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total
      );
      expect(mockMarkWorkflowFailed).not.toHaveBeenCalled();
    }
  );

  it('fails closed to connect-not-ready when the run has no design partner', async () => {
    mockSelectRouting({
      runRows: [
        {
          id: 'run-4',
          kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
          stepOutputs: {
            releaseId: 'release-1',
            release: { title: 'Launch Track' },
          },
        },
      ],
    });
    const { updateSet } = mockUpdateResolving();

    await initializeReleaseToRevenueRun({ workflowRunId: 'run-4' });

    expect(mockSyncStoreListingForRun).not.toHaveBeenCalled();
    expect(mockGetStripeConnectReadiness).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stepOutputs: expect.objectContaining({
          storeListing: {
            merchCardIds: [],
            status: 'connect-not-ready',
          },
        }),
      })
    );
    expect(mockGenerateDistributionDraftsForRun).toHaveBeenCalled();
  });
});
