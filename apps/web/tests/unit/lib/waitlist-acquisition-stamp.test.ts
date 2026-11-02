// @vitest-environment node
/**
 * Waitlist acquisition stamp ownership against a real Postgres (PGlite with
 * every production migration). The journey id arrives in a client cookie, so
 * the stamp must refuse a journey linked to another user or revoked.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn(),
}));

import { sql as drizzleSql } from 'drizzle-orm';
import { users } from '@/lib/db/schema/auth';
import { stampWaitlistAcquisitionId } from '@/lib/waitlist/approval';

let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = new PGlite();
  const dir = path.join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  );
  for (const entry of journal.entries) {
    await client.exec(
      readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8').replaceAll(
        '--> statement-breakpoint',
        ''
      )
    );
  }
  db = drizzle(client);
  holder.db = db;
}, 280_000);

afterAll(async () => client.close());

const ENTRY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function seed(
  journeyId: string,
  opts: { userId?: string; revoked?: boolean }
) {
  for (const id of [USER_A, USER_B]) {
    await db
      .insert(users)
      .values({
        id,
        email: `${id}@example.test`,
        userStatus: 'waitlist_approved',
      })
      .onConflictDoNothing();
  }
  await db.execute(drizzleSql`
    INSERT INTO acquisition_journeys (id, user_id, first_touch, consent_state, captured_at, consent_revoked_at)
    VALUES (${journeyId}::uuid, ${opts.userId ?? null}::uuid, '{}'::jsonb, 'analytics_allowed', now(),
      ${opts.revoked ? new Date() : null})`);
  await db.execute(
    drizzleSql`DELETE FROM waitlist_entries WHERE id = ${ENTRY}::uuid`
  );
  await db.execute(drizzleSql`
    INSERT INTO waitlist_entries (id, email, email_normalized) VALUES (${ENTRY}::uuid, 'a@example.com', 'a@example.com')`);
}
const stamped = async () =>
  (
    await db.execute<{ id: string | null }>(drizzleSql`
      SELECT qualification_inputs->>'acquisitionId' AS id FROM waitlist_entries WHERE id = ${ENTRY}::uuid`)
  ).rows[0]?.id ?? null;

describe('stampWaitlistAcquisitionId ownership', () => {
  it('stamps an unlinked journey', async () => {
    const j = '11111111-1111-4111-8111-111111111111';
    await seed(j, {});
    expect(await stampWaitlistAcquisitionId(ENTRY, j, USER_A)).toBe(true);
    expect(await stamped()).toBe(j);
  });

  it('stamps a journey already linked to the joining user', async () => {
    const j = '22222222-2222-4222-8222-222222222222';
    await seed(j, { userId: USER_A });
    expect(await stampWaitlistAcquisitionId(ENTRY, j, USER_A)).toBe(true);
    expect(await stamped()).toBe(j);
  });

  it('refuses a journey linked to another user', async () => {
    const j = '33333333-3333-4333-8333-333333333333';
    await seed(j, { userId: USER_B });
    expect(await stampWaitlistAcquisitionId(ENTRY, j, USER_A)).toBe(false);
    expect(await stamped()).toBeNull();
  });

  it('refuses a consent-revoked journey', async () => {
    const j = '44444444-4444-4444-8444-444444444444';
    await seed(j, { revoked: true });
    expect(await stampWaitlistAcquisitionId(ENTRY, j, USER_A)).toBe(false);
    expect(await stamped()).toBeNull();
  });
});
