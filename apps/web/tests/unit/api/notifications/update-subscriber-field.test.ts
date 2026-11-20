import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const hoisted = vi.hoisted(() => ({
  limit: vi.fn(),
  returning: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: hoisted.where }),
    }),
  },
}));
vi.mock('@/lib/db/schema/analytics', () => ({
  notificationSubscriptions: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    email: 'email',
    createdAt: 'created_at',
  },
}));
vi.mock('@/lib/env-server', () => ({
  env: { RESEND_API_KEY: 'test-resend-key' },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: hoisted.limit },
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { handleSubscriberFieldUpdate } from '@/app/api/notifications/update-subscriber-field';
import { db } from '@/lib/db';
import {
  generateSubscriptionManagementToken,
  SUBSCRIPTION_MANAGEMENT_COOKIE,
} from '@/lib/notifications/management-token';

const ARTIST = '123e4567-e89b-12d3-a456-426614174000';
const OPTIONS = {
  schema: z.object({
    artist_id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
  fieldName: 'name',
  extractField: (data: Record<string, string>) => ({ name: data.name }),
  logPrefix: 'Test',
  route: '/api/notifications/update-name',
  errorMessage: 'failed',
};

function makeRequest(email: string, cookie?: string) {
  return new NextRequest('http://localhost/api/notifications/update-name', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(cookie
        ? { cookie: `${SUBSCRIPTION_MANAGEMENT_COOKIE}=${cookie}` }
        : {}),
    },
    body: JSON.stringify({ artist_id: ARTIST, email, name: 'Mallory' }),
  });
}

describe('handleSubscriberFieldUpdate session binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.limit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
    });
    hoisted.where.mockReturnValue({
      returning: hoisted.returning.mockResolvedValue([{ id: 'sub-1' }]),
    });
  });

  it('rejects an update from someone who only holds the email address', async () => {
    const response = await handleSubscriberFieldUpdate(
      makeRequest('fan@example.com'),
      OPTIONS
    );

    expect(response.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects a token issued for a different email', async () => {
    const token = generateSubscriptionManagementToken(
      ARTIST,
      'other@example.com'
    );

    const response = await handleSubscriberFieldUpdate(
      makeRequest('fan@example.com', token ?? undefined),
      OPTIONS
    );

    expect(response.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects a token issued for a different artist', async () => {
    const token = generateSubscriptionManagementToken(
      '00000000-0000-4000-8000-000000000000',
      'fan@example.com'
    );

    const response = await handleSubscriberFieldUpdate(
      makeRequest('fan@example.com', token ?? undefined),
      OPTIONS
    );

    expect(response.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates when the signup session token matches artist and email', async () => {
    const token = generateSubscriptionManagementToken(
      ARTIST,
      'fan@example.com'
    );

    const response = await handleSubscriberFieldUpdate(
      makeRequest('Fan@Example.com', token ?? undefined),
      OPTIONS
    );

    expect(response.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
