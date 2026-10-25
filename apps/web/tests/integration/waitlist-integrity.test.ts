import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getWaitlistIntegritySummary } from '@/lib/admin/waitlist';
import { reconcileWaitlistAdmission } from '@/lib/waitlist/admission-detector';

const database = vi.hoisted(() => ({
  execute: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/lib/db', () => ({
  db: database,
  doesTableExist: async () => true,
}));

const certification = process.env.DB_CERTIFICATION === 'true';
const url =
  process.env.WAITLIST_INTEGRITY_TEST_DATABASE_URL ??
  (certification ? process.env.DATABASE_URL : undefined);
const migration = '0147_backfill_waitlist_integrity';

if (certification && !url) throw new Error('Certification database required');

describe.skipIf(!url)(
  'waitlist integrity on canonical Postgres migrations',
  () => {
    let client: ReturnType<typeof postgres>;

    async function applyMigration(tag: string) {
      const statements = readFileSync(
        `drizzle/migrations/${tag}.sql`,
        'utf8'
      ).split('--> statement-breakpoint');
      await client.begin(async tx => {
        for (const statement of statements) {
          if (statement.trim()) await tx.unsafe(statement);
        }
      });
    }

    beforeAll(async () => {
      if (!url) throw new Error('Waitlist integrity database required');
      const target = new URL(url);
      const loopback =
        target.hostname === '127.0.0.1' && target.pathname === '/jov5831_test';
      if (!loopback) {
        target.hostname = target.hostname.replace(
          /^(ep-[a-z0-9-]+?)-pooler\./,
          '$1.'
        );
        target.searchParams.delete('channel_binding');
        if (
          !certification ||
          !/^ep-[a-z0-9-]+\..*\.neon\.tech$/i.test(target.hostname) ||
          target.hostname.includes('-pooler.')
        ) {
          throw new Error(
            'Disposable local or isolated Neon certification database required'
          );
        }
      }
      client = postgres(target.toString(), {
        max: 1,
        onnotice: () => {},
        ...(loopback ? {} : { ssl: 'require' }),
      });
      if (loopback) {
        await client.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const journal = JSON.parse(
          readFileSync('drizzle/migrations/meta/_journal.json', 'utf8')
        ) as { entries: { tag: string }[] };
        for (const { tag } of journal.entries) {
          if (tag === migration) break;
          await applyMigration(tag);
        }
      }
      // Hosted certification has already run canonical migrations. Work only
      // on connection-local copies; other integration fixtures remain intact.
      for (const table of ['users', 'waitlist_entries', 'waitlist_settings']) {
        await client.unsafe(
          `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`
        );
      }
      const dialect = new PgDialect();
      database.execute.mockImplementation(async query => {
        const { sql, params } = dialect.sqlToQuery(query);
        return { rows: await client.unsafe(sql, params) };
      });
      const orm = drizzle(client);
      database.select.mockImplementation(orm.select.bind(orm));
      database.insert.mockImplementation(orm.insert.bind(orm));
    }, 120_000);

    afterAll(async () => {
      await client?.end();
    });

    beforeEach(async () => {
      await client.unsafe('TRUNCATE pg_temp.users, pg_temp.waitlist_entries');
    });

    it('repairs 49 legacy users, including approvals missed by the signup backfill', async () => {
      await client.unsafe(`
      INSERT INTO users (email, user_status)
      SELECT 'legacy-' || n || '@example.test',
        CASE WHEN n <= 25 THEN 'waitlist_pending'::user_status_lifecycle
          ELSE 'waitlist_approved'::user_status_lifecycle END
      FROM generate_series(1, 49) n
    `);
      expect(
        (await getWaitlistIntegritySummary()).usersMissingWaitlistEntry
      ).toBe(49);

      await applyMigration('0134_signup_waitlist_entries');
      expect(
        (await getWaitlistIntegritySummary()).usersMissingWaitlistEntry
      ).toBe(24);

      await applyMigration(migration);
      expect(await getWaitlistIntegritySummary()).toEqual({
        usersMissingWaitlistEntry: 0,
        entriesMissingUser: 0,
        signedUpEntriesMissingUser: 0,
        totalIssues: 0,
      });
      const entries = await client`SELECT status, count(*)::int AS count
      FROM waitlist_entries GROUP BY status ORDER BY status::text`;
      expect([...entries]).toEqual([
        { status: 'approved', count: 24 },
        { status: 'waitlisted', count: 25 },
      ]);
      await applyMigration(migration);
      expect(
        (await client`SELECT count(*)::int AS count FROM waitlist_entries`)[0]
          ?.count
      ).toBe(49);
      expect(
        (
          await client`SELECT count(*)::int AS count FROM users WHERE waitlist_entry_id IS NOT NULL`
        )[0]?.count
      ).toBe(0);
    });

    it('matches normalized legacy emails without overwriting existing intake or approval data', async () => {
      await client`INSERT INTO users (email, user_status) VALUES (' Existing@Example.test ', 'waitlist_approved')`;
      await client`INSERT INTO waitlist_entries (email, email_normalized, full_name, status)
      VALUES ('existing@example.test', 'existing@example.test', 'Existing Artist', 'blocked')`;
      await applyMigration(migration);
      expect((await getWaitlistIntegritySummary()).totalIssues).toBe(0);
      expect([
        ...(await client`SELECT full_name, status FROM waitlist_entries`),
      ]).toEqual([{ full_name: 'Existing Artist', status: 'blocked' }]);
    });

    it('leaves deleted and active users alone and keeps email-less users visible as unresolved', async () => {
      await client`INSERT INTO users (email, user_status, deleted_at) VALUES
      ('deleted@example.test', 'waitlist_pending', now()),
      ('active@example.test', 'active', null),
      (null, 'waitlist_pending', null),
      (' ', 'waitlist_approved', null)`;
      await applyMigration(migration);
      expect(
        (await client`SELECT count(*)::int AS count FROM waitlist_entries`)[0]
          ?.count
      ).toBe(0);
      expect(
        (await getWaitlistIntegritySummary()).usersMissingWaitlistEntry
      ).toBe(2);
    });

    it('counts each orphaned entry once while retaining the signed-up breakdown', async () => {
      await client`INSERT INTO waitlist_entries (email, email_normalized, status) VALUES
      ('invited@example.test', 'invited@example.test', 'invited'),
      ('signed-up@example.test', 'signed-up@example.test', 'signed_up')`;
      expect(await getWaitlistIntegritySummary()).toEqual({
        usersMissingWaitlistEntry: 0,
        entriesMissingUser: 2,
        signedUpEntriesMissingUser: 1,
        totalIssues: 2,
      });
    });

    it('repairs future pending and approved misses through the existing daily reconciler', async () => {
      await client`INSERT INTO users (email, user_status) VALUES
      ('pending@example.test', 'waitlist_pending'),
      ('approved@example.test', 'waitlist_approved')`;
      await reconcileWaitlistAdmission();
      expect((await getWaitlistIntegritySummary()).totalIssues).toBe(0);
      expect([
        ...(await client`SELECT status FROM waitlist_entries ORDER BY status::text`),
      ]).toEqual([{ status: 'approved' }, { status: 'waitlisted' }]);
      expect(await reconcileWaitlistAdmission()).toEqual({
        healedMissingEntries: 0,
        stalePending: 0,
      });
    });

    it('preserves a valid ID link and legacy raw-email matches in both directions', async () => {
      const [entry] =
        await client`INSERT INTO waitlist_entries (email, email_normalized, canonical, status)
      VALUES ('old@example.test', 'old@example.test', false, 'invited') RETURNING id`;
      await client`INSERT INTO users (email, user_status, waitlist_entry_id)
      VALUES ('renamed@example.test', 'waitlist_approved', ${entry?.id})`;
      await client`INSERT INTO users (email, user_status) VALUES (' Legacy@Example.test ', 'waitlist_approved')`;
      await client`INSERT INTO waitlist_entries (email, email_normalized, status)
      VALUES ('Legacy@Example.test', 'outdated@example.test', 'signed_up')`;
      await applyMigration(migration);
      expect((await getWaitlistIntegritySummary()).totalIssues).toBe(0);
      expect((await reconcileWaitlistAdmission()).healedMissingEntries).toBe(0);
      expect(
        (await client`SELECT count(*)::int AS count FROM waitlist_entries`)[0]
          ?.count
      ).toBe(2);
    });

    it('keeps an existing approval when case variants share one canonical email', async () => {
      await client`INSERT INTO users (email, user_status) VALUES
      ('duplicate@example.test', 'waitlist_pending'),
      ('Duplicate@Example.test', 'waitlist_approved')`;
      await applyMigration(migration);
      expect([...(await client`SELECT status FROM waitlist_entries`)]).toEqual([
        { status: 'approved' },
      ]);
      expect((await getWaitlistIntegritySummary()).totalIssues).toBe(0);
    });
  }
);
