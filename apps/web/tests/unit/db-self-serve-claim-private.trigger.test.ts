import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildSelfServeClaimProof,
  decideClaimVerificationRecord,
  readClaimVerification,
  withClaimVerification,
} from '@/lib/claim/claim-verification';
import { generateProofCode, isProofCode } from '@/lib/claim/proof-code';

/**
 * Self-serve claims stay private until verified (Tim, 2026-11-02). The claim
 * paths write the record built here; the real proof-before-public trigger
 * must keep the row private for it, whatever is_public the writer asked for.
 */
const migration = readFileSync(
  join(__dirname, '../../drizzle/migrations/0148_proof_before_public.sql'),
  'utf8'
);

let db: PGlite;

async function read(id: string) {
  const result = await db.query<{ is_public: boolean; settings: unknown }>(
    'SELECT is_public, settings FROM creator_profiles WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

function selfServeSettings(base: Record<string, unknown> = {}) {
  const record = buildSelfServeClaimProof({
    settings: base,
    spotifyArtistId: 'small_artist',
    artistName: 'Small Artist',
    followers: null,
    proofCode: generateProofCode(),
    now: new Date('2026-11-02T03:00:00.000Z'),
  });
  if (!record) throw new Error('expected a self-serve proof record');
  return withClaimVerification(base, record);
}

describe('fresh self-serve claim is private until ownership is proven', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      'CREATE TABLE creator_profiles (id text primary key, is_public boolean default true, settings jsonb)'
    );
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await db.exec(statement);
    }
    // In-process Postgres (WASM) boot is slow on a loaded runner.
  }, 30_000);
  afterAll(async () => db.close());

  it('inserts a fresh claim private, with a proof code', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['fresh', JSON.stringify(selfServeSettings())]
    );
    const stored = await read('fresh');
    expect(stored?.is_public).toBe(false);
    const record = readClaimVerification(stored?.settings);
    expect(record).toMatchObject({
      proofOnly: true,
      status: 'pending_verification',
    });
    expect(isProofCode(record?.proofCode)).toBe(true);
  });

  it('takes an already-public page private when a claim attaches the identity', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['attach', JSON.stringify({ existing: 'value' })]
    );
    // connect-spotify writes the proof record in the same update that links
    // the Spotify identity; a later publish attempt is still coerced.
    await db.query(
      'UPDATE creator_profiles SET settings = $2::jsonb WHERE id = $1',
      ['attach', JSON.stringify(selfServeSettings({ existing: 'value' }))]
    );
    await db.query(
      'UPDATE creator_profiles SET is_public = true WHERE id = $1',
      ['attach']
    );
    expect((await read('attach'))?.is_public).toBe(false);
  });

  it('publishes once the claim is verified', async () => {
    const settings = selfServeSettings();
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, false, $2::jsonb)',
      ['verified', JSON.stringify(settings)]
    );
    const verified = decideClaimVerificationRecord(
      readClaimVerification(settings),
      {
        decision: 'approve',
        decidedAt: new Date('2026-11-02T04:00:00.000Z'),
        decidedBy: 'operator',
      }
    );
    if (!verified) throw new Error('expected a verified record');
    await db.query(
      'UPDATE creator_profiles SET is_public = true, settings = $2::jsonb WHERE id = $1',
      ['verified', JSON.stringify(withClaimVerification(settings, verified))]
    );
    expect((await read('verified'))?.is_public).toBe(true);
  });
});
