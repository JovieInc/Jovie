// @vitest-environment node
/**
 * Journey -> user link against a real Postgres (PGlite with every production
 * migration). Prod had 0 of 28,349 journeys linked to a user: the link ran as
 * sibling data-modifying CTEs in one statement, and Postgres gives them one
 * snapshot, so the UPDATE never sees the row the INSERT just wrote and cannot
 * reliably update a row the upsert touched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertAndLinkJourney } from '@/lib/acquisition/journey-link';
import { users } from '@/lib/db/schema/auth';

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
}, 280_000);

afterAll(async () => client.close());

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const visit = (acquisitionId: string, appUserId: string | null) => ({
  acquisitionId,
  firstTouchJson: JSON.stringify({ campaign: 'via-jovie-footer' }),
  capturedAt: new Date('2026-10-26T00:00:00Z'),
  appUserId,
});
const rowOf = async (id: string) =>
  (
    await db.execute<{ user_id: string | null; linked_at: Date | null }>(
      drizzleSql`SELECT user_id, linked_at FROM acquisition_journeys WHERE id = ${id}::uuid`
    )
  ).rows[0];

describe('upsertAndLinkJourney', () => {
  it('links an existing anonymous journey when the visitor signs in', async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: 'link-existing@example.test',
        userStatus: 'waitlist_approved',
      })
      .returning({ id: users.id });
    await upsertAndLinkJourney(db, visit(ID, null));
    expect((await rowOf(ID)).user_id).toBeNull();
    await upsertAndLinkJourney(db, visit(ID, user.id));
    const row = await rowOf(ID);
    expect(row.user_id).toBe(user.id);
    expect(row.linked_at).not.toBeNull();
  });

  it('links a journey first seen while already signed in', async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: 'link-new@example.test',
        userStatus: 'waitlist_approved',
      })
      .returning({ id: users.id });
    await upsertAndLinkJourney(db, visit(ID2, user.id));
    expect((await rowOf(ID2)).user_id).toBe(user.id);
  });

  it('does not reassign a journey that belongs to another user', async () => {
    const [other] = await db
      .insert(users)
      .values({
        email: 'link-other@example.test',
        userStatus: 'waitlist_approved',
      })
      .returning({ id: users.id });
    await upsertAndLinkJourney(db, visit(ID, other.id));
    expect((await rowOf(ID)).user_id).not.toBe(other.id);
  });
});
