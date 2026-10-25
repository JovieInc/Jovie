import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildClaimVerificationRequest,
  withClaimVerification,
} from '@/lib/claim/claim-verification';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][] }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility: vi.fn(),
}));
vi.mock('@/lib/waitlist/settings', () => ({ getWaitlistSettings: vi.fn() }));
vi.mock('@/lib/waitlist/cohort-learnings', () => ({
  countOpenCohortLearnings: vi.fn(),
  MAX_OPEN_COHORT_LEARNINGS: 3,
}));
vi.mock('drizzle-orm', () => ({
  desc: (c: unknown) => c,
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', waitlistEntryId: 'users.waitlist_entry_id' },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    settings: 'cp.settings',
    userId: 'cp.user_id',
    createdAt: 'cp.created_at',
  },
}));
vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: { id: 'we.id', statusReason: 'we.status_reason' },
}));
vi.mock('@/lib/db', () => {
  const chain = () => {
    const result = () => Promise.resolve(mocks.rows.shift() ?? []);
    const node: Record<string, unknown> = {};
    for (const name of ['from', 'innerJoin', 'where', 'orderBy']) {
      node[name] = () => node;
    }
    node.limit = result;
    node.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve(mocks.rows.shift() ?? []);
    return node;
  };
  return { db: { select: () => chain() } };
});

import {
  hasProofPendingProfile,
  isGoldenPathAdmittedUser,
} from '@/lib/waitlist/golden-path-admission.server';

const proofRecord = (status: string) =>
  withClaimVerification({}, {
    ...buildClaimVerificationRequest({
      spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
      artistName: 'Mid Artist',
      reach: 3_200,
      paid: false,
      proofOnly: true,
      now: new Date('2026-10-21T08:00:00.000Z'),
    }),
    status,
  } as never);

describe('isGoldenPathAdmittedUser keeps the marker after the waitlist reason is overwritten', () => {
  beforeEach(() => {
    mocks.rows = [];
  });

  it('stays unproven from the profile record even when the entry reason changed', async () => {
    mocks.rows = [[{ settings: proofRecord('pending_verification') }]];
    expect(await isGoldenPathAdmittedUser('user-1')).toBe(true);
  });

  it('is proven once the operator verified', async () => {
    mocks.rows = [
      [{ settings: proofRecord('verified') }],
      [{ statusReason: 'onboarding_completed' }],
    ];
    expect(await isGoldenPathAdmittedUser('user-1')).toBe(false);
  });

  it('uses the fresh admission decision before any profile exists', async () => {
    mocks.rows = [
      [],
      [{ statusReason: 'qualified_golden_path_resolved_artist' }],
    ];
    expect(await isGoldenPathAdmittedUser('user-1')).toBe(true);
  });

  it('is false for every other approval', async () => {
    mocks.rows = [[], [{ statusReason: 'auto_accept_after_days' }]];
    expect(await isGoldenPathAdmittedUser('user-1')).toBe(false);
  });

  it('blocks checkout while any profile is unproven', async () => {
    mocks.rows = [[{ settings: proofRecord('pending_verification') }]];
    expect(await hasProofPendingProfile('user-1')).toBe(true);
    mocks.rows = [[{ settings: {} }]];
    expect(await hasProofPendingProfile('user-1')).toBe(false);
  });
});
