import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  audienceMembers,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';

const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const hoisted = vi.hoisted(() => ({
  members: [] as unknown[],
  subs: [] as unknown[],
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (op: (tx: unknown, id: string) => unknown) => {
    let table: unknown;
    const builder: Record<string, unknown> = {};
    for (const m of [
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'as',
    ]) {
      builder[m] = () => builder;
    }
    builder.from = (t: unknown) => {
      table = t;
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === audienceMembers
          ? hoisted.members
          : table === notificationSubscriptions
            ? hoisted.subs
            : []
      ).then(resolve);
    return op(
      { select: () => builder, execute: async () => ({ rows: [] }) },
      'clerk-1'
    );
  },
}));
vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: async () => ({ id: PROFILE_ID }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const member = (id: string, email: string | null, phone: string | null) => ({
  id,
  type: 'email',
  displayName: `Member ${id}`,
  visits: 3,
  engagementScore: 10,
  intentLevel: 'low',
  geoCity: 'Berlin',
  geoCountry: 'DE',
  deviceType: 'mobile',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email,
  phone,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  ltvMerchSalesCents: 0,
  ltvTicketSalesCents: 0,
  tags: [],
  lastSeenAt: new Date('2026-10-01T00:00:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
  hasActiveAlerts: true,
  activeAlertChannels: ['email'],
  lastAlertConfirmedAt: null,
});
const sub = (
  email: string | null,
  phone: string | null,
  optIn: string | null,
  unsub: string | null = null
) => ({
  email,
  phone,
  optInAt: optIn ? new Date(optIn) : null,
  optOutAt: null,
  unsubscribedAt: unsub ? new Date(unsub) : null,
});

async function getMembers(pageSize = 10) {
  const { GET } = await import('@/app/api/dashboard/audience/members/route');
  const res = await GET(
    new NextRequest(
      `http://localhost/api/dashboard/audience/members?profileId=${PROFILE_ID}&pageSize=${pageSize}`
    )
  );
  return { status: res.status, text: await res.text() };
}

describe('members API never serializes unshared identifiers', () => {
  beforeEach(() => {
    hoisted.members = [
      member('m1', 'level1@example.com', '+15550000001'),
      member('m2', 'shared@example.com', null),
      member('m3', 'revoked@example.com', '+15550000003'),
      member('m4', 'promo@example.com', null),
    ];
    hoisted.subs = [
      // Level 1: subscribed, never shared.
      sub('level1@example.com', '+15550000001', null),
      // Shared.
      sub('shared@example.com', null, '2026-01-01'),
      // Shared on row A, unsubscribed later on duplicate row B.
      sub('revoked@example.com', null, '2026-01-01'),
      sub('revoked@example.com', null, null, '2026-03-01'),
      // promo@example.com: no subscription row at all (promo download / tip / Spotify).
    ];
  });

  it('hides Level-1, revoked-duplicate and subscription-less members; shows the shared one', async () => {
    const { status, text } = await getMembers();
    expect(status).toBe(200);
    for (const secret of [
      'level1@example.com',
      '+15550000001',
      'revoked@example.com',
      '+15550000003',
      'promo@example.com',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('shared@example.com');
    const rows = JSON.parse(text).rows as {
      id: string;
      emailVisibleToArtist: boolean;
    }[];
    expect(rows.map(r => [r.id, r.emailVisibleToArtist])).toEqual([
      ['m1', false],
      ['m2', true],
      ['m3', false],
      ['m4', false],
    ]);
  });

  it('keeps identifiers out of nextCursor', async () => {
    const { text } = await getMembers(2);
    const body = JSON.parse(text) as { nextCursor: string | null };
    expect(body.nextCursor).toBeTruthy();
    const decoded = Buffer.from(String(body.nextCursor), 'base64').toString(
      'utf8'
    );
    for (const secret of [
      'level1@example.com',
      '+15550000001',
      'revoked@example.com',
      'promo@example.com',
    ]) {
      expect(text).not.toContain(secret);
      expect(decoded).not.toContain(secret);
    }
  });
});
