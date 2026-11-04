// @vitest-environment node
/**
 * Runs every production migration, including the grandfather migration, on
 * an in-process Postgres, then the real legacy sweep against it. Proves the
 * migration never changes visibility, skips rows it must not touch, and that
 * the sweep's proof-only transition is what takes a page private (through the
 * proof-before-public trigger), once.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as unknown }));
const fileCard = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('@/lib/claim/claim-verification-review.server', () => ({
  fileClaimVerificationCard: fileCard,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runLegacyClaimVerificationSweep } from '@/lib/claim/legacy-verification.server';

const MIGRATION_TAG = '0164_grandfather_claimed_profiles';
const dir = path.join(__dirname, '../../drizzle/migrations');

let client: PGlite;

function sqlFile(tag: string): string {
  return readFileSync(path.join(dir, `${tag}.sql`), 'utf8').replaceAll(
    '--> statement-breakpoint',
    ''
  );
}

async function insertProfile(input: {
  handle: string;
  isClaimed: boolean;
  isPublic: boolean;
  spotifyId: string | null;
  followers?: number | null;
  settings?: unknown;
}) {
  await client.query(
    `INSERT INTO creator_profiles
       (username, username_normalized, display_name, creator_type, is_claimed,
        is_public, spotify_id, spotify_followers, settings)
     VALUES ($1, $1, $2, 'artist', $3, $4, $5, $6, $7::jsonb)`,
    [
      input.handle,
      `Artist ${input.handle}`,
      input.isClaimed,
      input.isPublic,
      input.spotifyId,
      input.followers ?? null,
      JSON.stringify(input.settings ?? {}),
    ]
  );
}

async function read(handle: string) {
  const result = await client.query<{
    is_public: boolean;
    record: Record<string, unknown> | null;
  }>(
    `SELECT is_public, settings -> 'claimVerification' AS record
     FROM creator_profiles WHERE username_normalized = $1`,
    [handle]
  );
  return result.rows[0];
}

beforeAll(async () => {
  client = new PGlite();
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  ) as { entries: { tag: string }[] };
  const tags = journal.entries.map(entry => entry.tag);
  expect(tags.at(-1)).toBe(MIGRATION_TAG);
  for (const tag of tags.slice(0, -1)) await client.exec(sqlFile(tag));

  await insertProfile({
    handle: 'small',
    isClaimed: true,
    isPublic: true,
    spotifyId: 'sp-small',
    followers: 1_200,
    settings: { theme: 'dark' },
  });
  await insertProfile({
    handle: 'big',
    isClaimed: true,
    isPublic: true,
    spotifyId: 'sp-big',
    followers: 90_000,
  });
  await insertProfile({
    handle: 'unknownreach',
    isClaimed: true,
    isPublic: true,
    spotifyId: 'sp-unknown',
    followers: null,
  });
  await insertProfile({
    handle: 'private',
    isClaimed: true,
    isPublic: false,
    spotifyId: 'sp-private',
  });
  await insertProfile({
    handle: 'unclaimed',
    isClaimed: false,
    isPublic: true,
    spotifyId: 'sp-unclaimed',
  });
  await insertProfile({
    handle: 'nospotify',
    isClaimed: true,
    isPublic: true,
    spotifyId: null,
  });
  await insertProfile({
    handle: 'pending',
    isClaimed: true,
    isPublic: true,
    spotifyId: 'sp-pending',
    settings: {
      claimVerification: {
        schema: 'jovie-claim-verification/v1',
        status: 'pending_verification',
      },
    },
  });

  await client.exec(sqlFile(MIGRATION_TAG));
  holder.db = drizzle(client);
}, 280_000);

afterAll(async () => client.close());

describe('grandfather migration', () => {
  it('records claimed public Spotify-linked profiles as legacy-verified and keeps them public', async () => {
    const small = await read('small');
    expect(small.is_public).toBe(true);
    expect(small.record).toMatchObject({
      schema: 'jovie-claim-verification/v1',
      status: 'verified',
      proofMethod: 'legacy',
      spotifyArtistId: 'sp-small',
      artistName: 'Artist small',
      reach: { signal: 'spotify_followers', value: 1_200, threshold: 50_000 },
      decidedBy: 'grandfather-2026-11',
    });
    const record = small.record as Record<string, string>;
    expect(
      Date.parse(record.legacyNudgeDueAt) - Date.parse(record.decidedAt)
    ).toBe(30 * 86_400_000);

    expect((await read('unknownreach')).record).toMatchObject({
      reach: { value: 0 },
    });
  });

  it('keeps other settings keys', async () => {
    const result = await client.query<{ theme: string }>(
      `SELECT settings ->> 'theme' AS theme FROM creator_profiles WHERE username_normalized = 'small'`
    );
    expect(result.rows[0]?.theme).toBe('dark');
  });

  it('skips private, unclaimed, Spotify-less and already-recorded profiles, and changes no visibility', async () => {
    expect(await read('private')).toEqual({ is_public: false, record: null });
    expect(await read('unclaimed')).toEqual({ is_public: true, record: null });
    expect(await read('nospotify')).toEqual({ is_public: true, record: null });
    expect((await read('pending')).record).toEqual({
      schema: 'jovie-claim-verification/v1',
      status: 'pending_verification',
    });
  });

  it('is a no-op when re-run', async () => {
    const before = await read('big');
    await client.exec(sqlFile(MIGRATION_TAG));
    expect(await read('big')).toEqual(before);
  });
});

describe('legacy sweep', () => {
  it('does nothing while the flag is off', async () => {
    const result = await runLegacyClaimVerificationSweep(
      new Date(Date.now() + 31 * 86_400_000)
    );
    expect(result.skipped).toBe(true);
    expect((await read('big')).is_public).toBe(true);
  });

  it('stamps the nudge inside the window and takes a 50k+ page private after it, once', async () => {
    vi.stubEnv('FEATURE_CLAIM_LEGACY_PROOF_SWEEP', 'true');
    try {
      const inWindow = new Date(Date.now() + 86_400_000);
      expect(await runLegacyClaimVerificationSweep(inWindow)).toMatchObject({
        nudged: 3,
        proofRequired: 0,
      });
      expect((await read('small')).record).toMatchObject({
        nudgeSentAt: inWindow.toISOString(),
      });
      expect((await read('big')).is_public).toBe(true);

      const pastWindow = new Date(Date.now() + 31 * 86_400_000);
      expect(await runLegacyClaimVerificationSweep(pastWindow)).toMatchObject({
        scanned: 1,
        nudged: 0,
        proofRequired: 1,
      });
      const big = await read('big');
      expect(big.is_public).toBe(false);
      expect(big.record).toMatchObject({
        status: 'pending_verification',
        proofOnly: true,
        legacyProofRequiredAt: pastWindow.toISOString(),
      });
      expect(big.record).not.toHaveProperty('proofMethod');
      expect(fileCard).toHaveBeenCalledTimes(1);

      // The proof-before-public trigger keeps it private for any writer.
      await client.query(
        `UPDATE creator_profiles SET is_public = true WHERE username_normalized = 'big'`
      );
      expect((await read('big')).is_public).toBe(false);

      // Small pages stay public; a re-run changes nothing.
      expect((await read('small')).is_public).toBe(true);
      expect(await runLegacyClaimVerificationSweep(pastWindow)).toMatchObject({
        scanned: 0,
        nudged: 0,
        proofRequired: 0,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
