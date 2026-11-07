import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Executes the real migration SQL against an in-process Postgres. The trigger
 * is the single enforcement point for "no public page without ownership
 * proof": onboarding, mobile completion, the dashboard PATCH, ingestion
 * auto-publish and switch-profile all end in an UPDATE of creator_profiles.
 */
const migrations = [
  '0148_proof_before_public.sql',
  '0163_taken_down_never_public.sql',
].map(file =>
  readFileSync(join(__dirname, '../../drizzle/migrations', file), 'utf8')
);

let db: PGlite;

async function row(id: string) {
  const result = await db.query<{ is_public: boolean }>(
    'SELECT is_public FROM creator_profiles WHERE id = $1',
    [id]
  );
  return result.rows[0]?.is_public;
}

const proofOnly = (status: string) =>
  JSON.stringify({ claimVerification: { proofOnly: true, status } });

describe('creator_profiles proof-before-public trigger', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      'CREATE TABLE creator_profiles (id text primary key, is_public boolean default true, settings jsonb)'
    );
    for (const migration of migrations) {
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await db.exec(statement);
      }
    }
    // PGlite boot takes seconds on a loaded runner.
  }, 60_000);
  afterAll(async () => db.close());

  it('inserts an unproven proof-only profile private even when asked to be public', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['a', proofOnly('pending_verification')]
    );
    expect(await row('a')).toBe(false);
  });

  it('coerces every later attempt to publish (any writer) while proof is open or rejected', async () => {
    for (const [id, status] of [
      ['b', 'pending_verification'],
      ['c', 'rejected'],
    ] as const) {
      await db.query(
        'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, false, $2::jsonb)',
        [id, proofOnly(status)]
      );
      await db.query(
        'UPDATE creator_profiles SET is_public = true WHERE id = $1',
        [id]
      );
      expect(await row(id)).toBe(false);
    }
  });

  it('holds when settings change on an already-public row that turns proof-only', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['d', '{}']
    );
    await db.query(
      'UPDATE creator_profiles SET settings = $2::jsonb WHERE id = $1',
      ['d', proofOnly('pending_verification')]
    );
    expect(await row('d')).toBe(false);
  });

  it('lets the verified decision publish in one update', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, false, $2::jsonb)',
      ['e', proofOnly('pending_verification')]
    );
    await db.query(
      'UPDATE creator_profiles SET is_public = true, settings = $2::jsonb WHERE id = $1',
      ['e', proofOnly('verified')]
    );
    expect(await row('e')).toBe(true);
  });

  it('leaves paid high-reach requests and ordinary profiles untouched', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      [
        'f',
        JSON.stringify({
          claimVerification: { status: 'pending_verification' },
        }),
      ]
    );
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, NULL)',
      ['g']
    );
    expect(await row('f')).toBe(true);
    expect(await row('g')).toBe(true);
  });

  it('never lets a taken-down page be public, proof-only or not', async () => {
    for (const [id, settings] of [
      ['h', proofOnly('taken_down')],
      ['i', JSON.stringify({ claimVerification: { status: 'taken_down' } })],
    ] as const) {
      await db.query(
        'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
        [id, settings]
      );
      expect(await row(id)).toBe(false);
      await db.query(
        'UPDATE creator_profiles SET is_public = true WHERE id = $1',
        [id]
      );
      expect(await row(id)).toBe(false);
    }
  });

  it('takes a verified public page down in the same update that records the decision', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['j', JSON.stringify({ claimVerification: { status: 'verified' } })]
    );
    await db.query(
      'UPDATE creator_profiles SET settings = $2::jsonb WHERE id = $1',
      ['j', JSON.stringify({ claimVerification: { status: 'taken_down' } })]
    );
    expect(await row('j')).toBe(false);
  });

  it('keeps a disputed page up (frozen, not offline)', async () => {
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['k', proofOnly('verified')]
    );
    await db.query(
      'UPDATE creator_profiles SET settings = $2::jsonb WHERE id = $1',
      ['k', proofOnly('disputed')]
    );
    expect(await row('k')).toBe(true);
    await db.query(
      'INSERT INTO creator_profiles (id, is_public, settings) VALUES ($1, true, $2::jsonb)',
      ['l', JSON.stringify({ claimVerification: { status: 'disputed' } })]
    );
    expect(await row('l')).toBe(true);
  });
});
