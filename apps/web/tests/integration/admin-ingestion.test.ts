import { sql as drizzleSql, eq } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Test requires full schema access */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/admin/creator-ingest/route';
import * as schema from '@/lib/db/schema';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

type TestDb = NeonDatabase<typeof schema>;

const adminEntitlements = {
  userId: 'admin_user',
  email: 'admin@example.com',
  isAuthenticated: true,
  isAdmin: true,
  isPro: false,
  hasAdvancedFeatures: true,
  canRemoveBranding: true,
};

const extractLinktreeMock = vi.fn(() => ({
  displayName: 'CSV Import Artist',
  avatarUrl: 'https://images.test/csv-avatar.png',
  links: [
    { url: 'https://spotify.com/csv-import', title: 'Spotify' },
    { url: 'https://linktr.ee/csv-related', title: 'Linktree Mirror' },
  ],
}));

const avatarFromLinksMock = vi.fn(async () => {
  return 'https://blob.test/ingestion-avatar.avif';
});

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(async () => adminEntitlements),
}));

vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  extractLinktree: (...args: Parameters<typeof extractLinktreeMock>) =>
    extractLinktreeMock(...args),
  extractLinktreeHandle: (url: string) =>
    url.split('/').filter(Boolean).pop() ?? null,
  fetchLinktreeDocument: vi.fn(async () => '<html></html>'),
  isValidHandle: () => true,
  normalizeHandle: (handle: string) => handle.toLowerCase(),
  validateLinktreeUrl: (url: string) =>
    url.startsWith('https://linktr.ee/') ? url : null,
}));

vi.mock('@/lib/ingestion/strategies/laylo', () => ({
  extractLaylo: vi.fn(),
  extractLayloHandle: vi.fn(),
  fetchLayloProfile: vi.fn(),
  isLayloUrl: () => false,
  normalizeLayloHandle: (handle: string) => handle,
  validateLayloUrl: () => null,
}));

vi.mock('@/lib/ingestion/magic-profile-avatar', () => ({
  maybeCopyIngestionAvatarFromLinks: (
    ...args: Parameters<typeof avatarFromLinksMock>
  ) => avatarFromLinksMock(...args),
}));

setupDatabaseBeforeAll();

let db: TestDb;
const createdProfileIds: string[] = [];

function parseCsv(content: string): Array<Record<string, string>> {
  const rows = content.trim().split('\n');
  if (rows.length === 0) return [];

  const headers = rows[0]!.split(',').map(header => header.trim());

  return rows
    .slice(1)
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => {
      const cells = row.split(',').map(cell => cell.trim());
      return headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = cells[index] ?? '';
        return acc;
      }, {});
    });
}

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    throw new Error(
      'Database connection not initialized for admin ingestion integration tests'
    );
  }
  db = connection;
});

afterEach(async () => {
  for (const profileId of createdProfileIds) {
    await db
      .delete(socialLinks)
      .where(eq(socialLinks.creatorProfileId, profileId));
    await db.execute(
      drizzleSql`DELETE FROM ingestion_jobs WHERE payload ->> 'creatorProfileId' = ${profileId}`
    );
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));
  }

  createdProfileIds.length = 0;
  extractLinktreeMock.mockClear();
  avatarFromLinksMock.mockClear();
});

describe('Admin ingestion pipeline (integration)', () => {
  it('processes CSV upload through ingestion pipeline', async () => {
    const handle = `csv-import-${Date.now()}`;
    const csv = `url,platform\nhttps://linktr.ee/${handle},linktree`;
    const [row] = parseCsv(csv);

    const response = await POST(
      new Request('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row?.url }),
      })
    );

    const payload = (await response.json()) as {
      ok?: boolean;
      profile?: { id: string; username: string; claimToken: string | null };
      links?: number;
      warning?: string;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.profile?.username).toBe(handle);
    expect(extractLinktreeMock).toHaveBeenCalled();
    expect(payload.links).toBe(2);
    expect(payload.warning).toBeUndefined();

    const profileId = payload.profile?.id;
    expect(profileId).toBeDefined();
    createdProfileIds.push(profileId!);

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        claimToken: creatorProfiles.claimToken,
        ingestionStatus: creatorProfiles.ingestionStatus,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId!));

    expect(profile?.username).toBe(handle);
    expect(profile?.claimToken).toBeTruthy();
    expect(profile?.ingestionStatus).toBe('idle');
    expect(avatarFromLinksMock).toHaveBeenCalled();

    const links = await db
      .select({ url: socialLinks.url })
      .from(socialLinks)
      .where(eq(socialLinks.creatorProfileId, profileId!));
    expect(links).toHaveLength(2);

    const jobs = await db
      .select({ payload: ingestionJobs.payload })
      .from(ingestionJobs)
      .where(
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${profileId!}`
      );
    expect(jobs).toHaveLength(1);
    expect(
      (jobs[0]?.payload as Record<string, unknown> | undefined)?.dedupKey
    ).toBeTruthy();
  });

  it('rejects invalid CSV rows with clear validation errors', async () => {
    const invalidCsv = 'url,platform\nnot-a-valid-url,linktree';
    const [row] = parseCsv(invalidCsv);

    const response = await POST(
      new Request('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row?.url }),
      })
    );

    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toContain('Invalid profile URL');
    expect(extractLinktreeMock).not.toHaveBeenCalled();
  });

  it('blocks duplicate claimed profiles during CSV ingestion', async () => {
    const handle = `csv-duplicate-${Date.now()}`;
    const csv = `url,platform\nhttps://linktr.ee/${handle},linktree`;
    const [row] = parseCsv(csv);

    const initial = await POST(
      new Request('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row?.url }),
      })
    );

    const initialPayload = (await initial.json()) as {
      profile?: { id: string };
    };
    const profileId = initialPayload.profile?.id;
    expect(profileId).toBeDefined();
    createdProfileIds.push(profileId!);

    await db
      .update(creatorProfiles)
      .set({ isClaimed: true })
      .where(eq(creatorProfiles.id, profileId!));

    const duplicate = await POST(
      new Request('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row?.url }),
      })
    );

    const duplicatePayload = (await duplicate.json()) as { error?: string };

    expect(duplicate.status).toBe(409);
    expect(duplicatePayload.error).toMatch(/already claimed/i);

    const existing = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, handle));
    expect(existing).toHaveLength(1);
  });
});
