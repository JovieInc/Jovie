import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test requires full schema access */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { NextRequest } from 'next/server';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import * as schema from '@/lib/db/schema';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { unsubscribeTokens } from '@/lib/db/schema/suppression';
import { hashEmailOtp } from '@/lib/notifications/email-otp';
import { hashEmail } from '@/lib/notifications/suppression';
import { setupDatabaseBeforeAll } from '../setup-db';

type TestDb = NeonDatabase<typeof schema>;

const generalLimiterLimitMock = vi.hoisted(() => vi.fn());
const emailOtpLimiterLimitMock = vi.hoisted(() => vi.fn());
const sendNotificationMock = vi.hoisted(() => vi.fn());
const fireSubscribeCAPIEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn().mockReturnValue({
    limit: emailOtpLimiterLimitMock,
  }),
  generalLimiter: {
    limit: generalLimiterLimitMock,
  },
  createRateLimitHeaders: vi.fn(() => ({})),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: sendNotificationMock,
}));

vi.mock('@/lib/notifications/analytics', () => ({
  extractPayloadProps: vi.fn(() => ({})),
  inferChannel: vi.fn(() => 'email'),
  trackServerError: vi.fn(async () => undefined),
  trackSubscribeAttempt: vi.fn(async () => undefined),
  trackSubscribeError: vi.fn(async () => undefined),
  trackSubscribeSuccess: vi.fn(async () => undefined),
  trackUnsubscribeAttempt: vi.fn(async () => undefined),
  trackUnsubscribeError: vi.fn(async () => undefined),
  trackUnsubscribeSuccess: vi.fn(async () => undefined),
}));

vi.mock('@/lib/tracking/fire-subscribe-event', () => ({
  fireSubscribeCAPIEvent: fireSubscribeCAPIEventMock,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(
    async (callback: (db: TestDb) => Promise<unknown>) =>
      callback((globalThis as typeof globalThis & { db: TestDb }).db)
  ),
}));

vi.mock('@/app/api/audience/lib/audience-utils', () => ({
  createFingerprint: vi.fn(() => 'integration-fingerprint'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(async () => undefined),
}));

vi.mock('@/lib/notifications/email-otp', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/notifications/email-otp')
  >('@/lib/notifications/email-otp');

  return {
    ...actual,
    generateEmailOtpCode: vi.fn(() => '123456'),
  };
});

setupDatabaseBeforeAll();

let db: TestDb;
const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];
const createdTokenIds: string[] = [];

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    throw new Error(
      'Database connection not initialized for notifications integration tests'
    );
  }

  db = connection;
});

beforeEach(() => {
  vi.clearAllMocks();

  generalLimiterLimitMock.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: new Date(Date.now() + 60_000),
  });
  emailOtpLimiterLimitMock.mockResolvedValue({
    success: true,
    limit: 10,
    remaining: 9,
    reset: new Date(Date.now() + 60_000),
  });
  sendNotificationMock.mockResolvedValue({ delivered: ['email'] });
  fireSubscribeCAPIEventMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (createdTokenIds.length > 0) {
    await db
      .delete(unsubscribeTokens)
      .where(inArray(unsubscribeTokens.id, createdTokenIds));
  }

  if (createdProfileIds.length > 0) {
    await db
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, createdProfileIds));
  }

  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }

  createdTokenIds.length = 0;
  createdProfileIds.length = 0;
  createdUserIds.length = 0;
});

async function createArtistProfile() {
  const suffix = Date.now().toString(36);
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `notifications_integration_${suffix}`,
      email: `notifications-${suffix}@example.com`,
      userStatus: 'active',
      isPro: false,
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);

  const [profile] = await db
    .insert(creatorProfiles)
    .values({
      userId: user.id,
      creatorType: 'artist',
      username: `notify-${suffix}`,
      usernameNormalized: `notify-${suffix}`,
      displayName: 'Integration Artist',
      isPublic: true,
      isClaimed: true,
      claimedAt: new Date(),
      onboardingCompletedAt: new Date(),
    })
    .returning({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
    });
  createdProfileIds.push(profile.id);

  return profile;
}

describe('notifications subscription persistence (integration)', () => {
  it('persists a pending email subscription with OTP state via POST /api/notifications/subscribe', async () => {
    const artist = await createArtistProfile();
    const email = `fan-${Date.now().toString(36)}@example.com`;
    const { POST } = await import('@/app/api/notifications/subscribe/route');

    const response = await POST(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'Vitest',
        },
        body: JSON.stringify({
          artist_id: artist.id,
          email,
          channel: 'email',
          source: 'profile_inline',
        }),
      })
    );

    const payload = (await response.json()) as {
      success?: boolean;
      pendingConfirmation?: boolean;
      requiresOtp?: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        pendingConfirmation: true,
        requiresOtp: true,
      })
    );

    const [subscription] = await db
      .select({
        artistId: notificationSubscriptions.creatorProfileId,
        email: notificationSubscriptions.email,
        channel: notificationSubscriptions.channel,
        confirmedAt: notificationSubscriptions.confirmedAt,
        emailOtpHash: notificationSubscriptions.emailOtpHash,
        emailOtpExpiresAt: notificationSubscriptions.emailOtpExpiresAt,
        emailOtpAttempts: notificationSubscriptions.emailOtpAttempts,
      })
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.creatorProfileId, artist.id));

    expect(subscription).toEqual(
      expect.objectContaining({
        artistId: artist.id,
        email,
        channel: 'email',
        confirmedAt: null,
        emailOtpHash: hashEmailOtp('123456'),
        emailOtpAttempts: 0,
      })
    );
    expect(subscription?.emailOtpExpiresAt).toBeInstanceOf(Date);
    expect(subscription!.emailOtpExpiresAt!.getTime()).toBeGreaterThan(
      Date.now()
    );
  }, 20_000);

  it('confirms the subscription and clears OTP fields via POST /api/notifications/verify-email-otp', async () => {
    const artist = await createArtistProfile();
    const email = `fan-verify-${Date.now().toString(36)}@example.com`;
    const { POST: subscribe } = await import(
      '@/app/api/notifications/subscribe/route'
    );
    const { POST: verify } = await import(
      '@/app/api/notifications/verify-email-otp/route'
    );

    await subscribe(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'Vitest',
        },
        body: JSON.stringify({
          artist_id: artist.id,
          email,
          channel: 'email',
          source: 'profile_inline',
        }),
      })
    );

    const response = await verify(
      new NextRequest('http://localhost/api/notifications/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: artist.id,
          email,
          otp_code: '123456',
        }),
      })
    );

    const payload = (await response.json()) as {
      success?: boolean;
      message?: string;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        message: 'Email verified successfully',
      })
    );

    const [subscription] = await db
      .select({
        confirmedAt: notificationSubscriptions.confirmedAt,
        emailOtpHash: notificationSubscriptions.emailOtpHash,
        emailOtpExpiresAt: notificationSubscriptions.emailOtpExpiresAt,
        emailOtpAttempts: notificationSubscriptions.emailOtpAttempts,
      })
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.creatorProfileId, artist.id));

    expect(subscription?.confirmedAt).toBeInstanceOf(Date);
    expect(subscription?.emailOtpHash).toBeNull();
    expect(subscription?.emailOtpExpiresAt).toBeNull();
    expect(subscription?.emailOtpAttempts).toBe(0);
    expect(fireSubscribeCAPIEventMock).toHaveBeenCalledWith({
      creatorProfileId: artist.id,
      email,
    });
  }, 20_000);

  it('removes the subscription and marks the token used via POST /api/notifications/unsubscribe', async () => {
    const artist = await createArtistProfile();
    const email = `fan-unsub-${Date.now().toString(36)}@example.com`;
    const rawToken = `token-${Date.now().toString(36)}`;
    const [subscription] = await db
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: artist.id,
        channel: 'email',
        email,
        source: 'profile_inline',
        confirmedAt: new Date(),
      })
      .returning({ id: notificationSubscriptions.id });

    expect(subscription?.id).toBeTruthy();

    const [token] = await db
      .insert(unsubscribeTokens)
      .values({
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        emailHash: hashEmail(email),
        scopeType: 'artist',
        scopeId: artist.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: unsubscribeTokens.id });
    createdTokenIds.push(token.id);

    const { POST } = await import('@/app/api/notifications/unsubscribe/route');
    const response = await POST(
      new NextRequest('http://localhost/api/notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: artist.id,
          token: rawToken,
          method: 'email_link',
        }),
      })
    );

    const payload = (await response.json()) as {
      success?: boolean;
      removed?: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        removed: 1,
      })
    );

    const remainingSubscriptions = await db
      .select({ id: notificationSubscriptions.id })
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.creatorProfileId, artist.id));
    expect(remainingSubscriptions).toHaveLength(0);

    const [storedToken] = await db
      .select({ usedAt: unsubscribeTokens.usedAt })
      .from(unsubscribeTokens)
      .where(eq(unsubscribeTokens.id, token.id));
    expect(storedToken?.usedAt).toBeInstanceOf(Date);
  }, 20_000);
});
