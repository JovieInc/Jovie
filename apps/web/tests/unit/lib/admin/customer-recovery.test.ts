import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  getCanonicalContacts: vi.fn(),
  select: vi.fn(),
  rows: [] as unknown[][],
}));

vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/admin/contacts', () => ({
  getCanonicalContacts: mocks.getCanonicalContacts,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import {
  deriveCustomerBlocker,
  getCustomerRecovery,
  selectRecoveryMatch,
} from '@/lib/admin/customer-recovery';

function installRows(...rows: unknown[][]) {
  mocks.rows.splice(0, mocks.rows.length, ...rows);
  mocks.select.mockImplementation(() => {
    const result = mocks.rows.shift() ?? [];
    const chain = {
      from: vi.fn(),
      limit: vi.fn(() => Promise.resolve(result)),
      orderBy: vi.fn(),
      then: (resolve?: (value: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
      where: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installRows();
});

describe('customer recovery selection and blockers', () => {
  it.each([
    ['failed', false, 'ingestion-missing-source', null],
    ['failed', true, 'ingestion-failed', 'rerun-ingestion'],
    ['pending', true, 'ingestion-in-flight', null],
    ['processing', true, 'ingestion-in-flight', null],
    ['idle', true, 'none', null],
  ])('maps %s/source=%s to %s', (status, source, kind, operation) => {
    expect(
      deriveCustomerBlocker({
        ingestionStatus: status,
        lastIngestionError: null,
        hasSpotifySource: source,
      })
    ).toMatchObject({ kind, operation });
  });

  it('selects only explicit or exact matches when search is ambiguous', () => {
    const contacts = [
      { dedupeKey: 'email:ada@x.com', email: 'ada@x.com', userId: 'u1' },
      { dedupeKey: 'handle:ada-two', handle: 'ada-two' },
    ] as Parameters<typeof selectRecoveryMatch>[0];

    expect(selectRecoveryMatch([], 'ada')).toBeNull();
    expect(selectRecoveryMatch(contacts, 'ada', 'handle:ada-two')).toBe(
      'handle:ada-two'
    );
    expect(selectRecoveryMatch(contacts, 'u1')).toBe('email:ada@x.com');
    expect(selectRecoveryMatch(contacts, 'ad')).toBeNull();
  });
});

describe('getCustomerRecovery', () => {
  it('assembles independently sourced facts and the supported repair', async () => {
    const at = new Date('2026-10-02T16:00:00.000Z');
    mocks.getCanonicalContacts.mockResolvedValue({
      contacts: [
        {
          dedupeKey: 'email:ada@analytical-engine.co',
          email: 'ada@analytical-engine.co',
          stage: 'paying',
          sources: ['user', 'profile'],
          userId: 'u1',
          creatorProfileId: 'p1',
          waitlistEntryId: 'w1',
        },
      ],
    });
    installRows(
      [
        {
          plan: 'pro',
          stripeSubscriptionId: 'sub_1',
          email: 'ada@analytical-engine.co',
        },
      ],
      [{ status: 'approved' }],
      [
        {
          ingestionStatus: 'failed',
          lastIngestionError: 'rate limited',
          spotifyId: 'artist-1',
          spotifyUrl: null,
          usernameNormalized: 'ada',
        },
      ],
      [{ value: 2 }],
      [{ value: 7 }],
      [
        {
          type: 'artist-ingest',
          result: 'failed',
          failureReason: 'rate limited',
          createdAt: at,
        },
      ]
    );

    const result = await getCustomerRecovery(' ADA@ANALYTICAL-ENGINE.CO ');

    expect(mocks.getCanonicalContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'ADA@ANALYTICAL-ENGINE.CO',
        throwOnError: true,
      })
    );
    expect(result.dossier).toMatchObject({
      account: { plan: 'pro', isPaying: true },
      authority: { ingestionStatus: 'failed', hasSpotifySource: true },
      admission: { status: 'approved' },
      connections: { activeSocialLinks: 2 },
      launch: { releaseCount: 7 },
      blocker: { operation: 'rerun-ingestion' },
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it('distinguishes unavailable evidence from no matches', async () => {
    const error = new Error('contacts unavailable');
    mocks.getCanonicalContacts.mockRejectedValue(error);

    await expect(getCustomerRecovery('ada')).resolves.toMatchObject({
      matches: [],
      dossier: null,
      error: 'unavailable',
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Error loading customer recovery matches',
      error,
      expect.any(Object)
    );
  });
});
