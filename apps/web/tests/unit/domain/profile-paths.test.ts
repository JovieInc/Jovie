import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  userId: 'user_123',
  updateProfileRecords: vi.fn(),
  findFirst: vi.fn(),
  insertValues: vi.fn().mockResolvedValue(undefined),
  walletRefresh: vi.fn().mockResolvedValue(undefined),
  finalize: vi.fn().mockResolvedValue(undefined),
}));

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000001';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({
  requireAuth: async () => hoisted.userId,
  withDbSessionTx: async (callback: (tx: unknown) => unknown) => callback({}),
  withDbSession: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: hoisted.userId }),
}));
vi.mock('@/app/api/dashboard/profile/lib/db-operations', () => ({
  updateProfileRecords: hoisted.updateProfileRecords,
  readWritableProfileUsername: vi.fn().mockResolvedValue(null),
  getProfileUpdatePreflight: vi.fn(),
  getProfileByClerkId: vi.fn(),
}));
vi.mock('@/app/api/dashboard/profile/lib/response', async importOriginal => ({
  ...(await importOriginal<object>()),
  finalizeProfileResponse: hoisted.finalize,
}));
vi.mock('@/lib/db', () => ({
  db: {
    query: { creatorProfiles: { findFirst: hoisted.findFirst } },
    insert: () => ({ values: hoisted.insertValues }),
  },
}));
vi.mock('@/lib/db/social-links-sync', () => ({
  syncSocialLinksFromPrimaryMusicUrls: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/wallet/apple/profile-pass', () => ({
  refreshAppleWalletProfilePassForProfileId: hoisted.walletRefresh,
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(),
}));
vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ getClientIP: () => '127.0.0.1' }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST as confirmEdit } from '@/app/api/chat/confirm-edit/route';
import { PUT as settingsForm } from '@/app/api/dashboard/profile/route';

const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const viaForm = (updates: Record<string, unknown>) =>
  settingsForm(
    jsonRequest('http://localhost/api/dashboard/profile', 'PUT', {
      profileId: PROFILE_ID,
      updates,
    })
  );

const viaChat = (field: 'displayName' | 'bio', newValue: string) =>
  confirmEdit(
    jsonRequest('http://localhost/api/chat/confirm-edit', 'POST', {
      profileId: PROFILE_ID,
      field,
      newValue,
    })
  );

const lastWrite = () => hoisted.updateProfileRecords.mock.calls.at(-1)?.[0];

describe('profile edit: the settings form and the chat confirmation save the same state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findFirst.mockResolvedValue({
      id: PROFILE_ID,
      userId: hoisted.userId,
      displayName: 'Old Name',
      bio: 'Old bio',
    });
    hoisted.updateProfileRecords.mockResolvedValue({
      updatedProfile: { id: PROFILE_ID, avatarUrl: null },
      oldUsernameNormalized: 'artist',
    });
  });

  it.each([
    ['displayName', '  New Name  '],
    ['bio', 'A short, true bio.'],
  ] as const)(
    '%s: the same write, validation, version check and Clerk name sync',
    async (field, value) => {
      expect((await viaForm({ [field]: value })).status).toBe(200);
      const form = lastWrite();
      hoisted.updateProfileRecords.mockClear();

      expect((await viaChat(field, value)).status).toBe(200);
      const chat = lastWrite();

      expect(form).toBeDefined();
      // Same transaction input: the fields, the Clerk name sync, the optimistic
      // version (neither supplies one), and the same caller identity.
      expect(chat).toEqual(form);
      expect(chat.profileId).toBe(PROFILE_ID);
      expect(chat.appUserId).toBe(hoisted.userId);
      if (field === 'displayName')
        expect(chat.displayNameForUserUpdate).toBe('New Name');
    }
  );

  it('chat edits are validated like form edits (the form rejects, so chat rejects)', async () => {
    const tooLong = 'x'.repeat(5000);
    const form = await viaForm({ bio: tooLong });
    hoisted.updateProfileRecords.mockClear();
    const chat = await viaChat('bio', tooLong);
    expect(form.status).toBe(400);
    expect(chat.status).toBe(400);
    expect(hoisted.updateProfileRecords).not.toHaveBeenCalled();
  });

  it('both paths run the same post-write steps: Apple Wallet pass and cache finalization', async () => {
    await viaForm({ displayName: 'New Name' });
    const formCalls = [
      hoisted.walletRefresh.mock.calls.length,
      hoisted.finalize.mock.calls.length,
    ];
    hoisted.walletRefresh.mockClear();
    hoisted.finalize.mockClear();
    await viaChat('displayName', 'New Name');
    expect([
      hoisted.walletRefresh.mock.calls.length,
      hoisted.finalize.mock.calls.length,
    ]).toEqual(formCalls);
    expect(formCalls).toEqual([1, 1]);
  });

  it('a stale or refused write surfaces the same way (domain response passes through)', async () => {
    hoisted.updateProfileRecords.mockResolvedValue(
      NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    );
    expect((await viaForm({ displayName: 'New Name' })).status).toBe(404);
    expect((await viaChat('displayName', 'New Name')).status).toBe(404);
  });
});
