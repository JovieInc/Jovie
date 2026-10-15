import { randomUUID } from 'node:crypto';
import { sql as drizzleSql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { setInternalDb } from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistAuditLogs, waitlistEntries } from '@/lib/db/schema/waitlist';
import {
  approveWaitlistEntryInTx,
  disapproveWaitlistEntryInTx,
} from '@/lib/waitlist/approval';
import { enqueueWaitlistApprovalInviteEmail } from '@/lib/waitlist/email-jobs';

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn(),
}));
vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn(() => {
    throw new Error('External delivery inside transaction');
  }),
}));
vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptPII: () => 'encrypted'.repeat(8),
  decryptPII: () => 'token',
}));

// Explicit disposable loopback database only; never mutate the default dev URL.
const url = process.env.ATOMIC_TEST_DATABASE_URL;
const tables = [
  users,
  creatorProfiles,
  waitlistEntries,
  waitlistAuditLogs,
  ingestionJobs,
];
const actorId = randomUUID();
const entryId = randomUUID();
const profileId = randomUUID();
const oldProfileId = randomUUID();

describe.skipIf(!url)(
  'certified atomic operations on real Postgres (JOV-6269)',
  () => {
    let client: ReturnType<typeof postgres>;
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        parsed.hostname !== '127.0.0.1' ||
        parsed.pathname !== '/jov6269_atomic'
      )
        throw new Error('Disposable local database required');
      client = postgres(url!, { max: 1 });
      // Real SQL/rollback with production helpers; fixture columns, no production schema claims.
      for (const table of tables) {
        const config = getTableConfig(table);
        const columns = config.columns.map(c => {
          const type =
            c.getSQLType() === 'uuid'
              ? 'uuid'
              : ({
                  boolean: 'boolean',
                  number: 'integer',
                  date: 'timestamp',
                  json: 'jsonb',
                  array: 'text[]',
                }[c.dataType] ?? 'text');
          return `"${c.name}" ${type}${c.name === 'id' ? ' PRIMARY KEY DEFAULT gen_random_uuid()' : ''}${c.name === 'dedup_key' ? ' UNIQUE' : ''}`;
        });
        await client.unsafe(
          `CREATE TEMP TABLE "${config.name}" (${columns.join(',')})`
        );
      }
      await client.unsafe(`CREATE FUNCTION pg_temp.inject_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE n integer := coalesce(nullif(current_setting('jovie.write_count',true),''),'0')::integer + 1;
      BEGIN PERFORM set_config('jovie.write_count',n::text,true);
      IF n = coalesce(nullif(current_setting('jovie.fail_after',true),''),'0')::integer THEN RAISE EXCEPTION 'injected write %', n; END IF;
      RETURN NEW; END $$`);
      for (const table of tables)
        await client.unsafe(
          `CREATE TRIGGER inject_failure AFTER INSERT OR UPDATE ON "${getTableConfig(table).name}" FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.inject_write_failure()`
        );
      setInternalDb(drizzle(client) as unknown as DbType);
    });
    afterAll(async () => {
      await client?.end();
    });

    async function seed(status: 'new' | 'invited') {
      for (const table of tables)
        await client.unsafe(`TRUNCATE "${getTableConfig(table).name}"`);
      await client`INSERT INTO users(id,email,user_status) VALUES (${actorId},'atomic@example.com',${status === 'new' ? 'waitlist_pending' : 'waitlist_approved'})`;
      await client`INSERT INTO waitlist_entries(id,email,status) VALUES (${entryId},'atomic@example.com',${status})`;
      if (status === 'new')
        await client`INSERT INTO creator_profiles(id,user_id,is_claimed) VALUES (${oldProfileId},${actorId},true)`;
      await client`INSERT INTO creator_profiles(id,user_id,waitlist_entry_id,is_claimed) VALUES (${profileId},${status === 'new' ? null : actorId},${entryId},${status !== 'new'})`;
    }
    const snapshot = async () =>
      Promise.all(
        tables.map(table =>
          client.unsafe(
            `SELECT * FROM "${getTableConfig(table).name}" ORDER BY id`
          )
        )
      );

    for (const approval of [true, false]) {
      it(`${approval ? 'approval + invite outbox' : 'revocation'} rolls back at every write boundary and commits/replays coherently`, async () => {
        const writes = approval ? 7 : 4;
        const operate = async (failAfter: number) =>
          runAtomicDbOperation(
            async tx => {
              await tx.execute(
                drizzleSql`SELECT set_config('jovie.write_count','0',true), set_config('jovie.fail_after',${String(failAfter)},true)`
              );
              if (!approval) return disapproveWaitlistEntryInTx(tx, entryId);
              const result = await approveWaitlistEntryInTx(tx, entryId);
              if (result.outcome === 'approved')
                await enqueueWaitlistApprovalInviteEmail(tx, entryId);
              return result;
            },
            { actorId, system: true, retry: 'never' }
          );
        for (let fail = 1; fail <= writes; fail++) {
          await seed(approval ? 'new' : 'invited');
          const before = await snapshot();
          await expect(operate(fail)).rejects.toThrow();
          expect(await snapshot()).toEqual(before);
        }
        await seed(approval ? 'new' : 'invited');
        await operate(0);
        const committed = await snapshot();
        expect(committed[2][0].status).toBe(
          approval ? 'invited' : 'waitlisted'
        );
        expect(committed[0][0].user_status).toBe(
          approval ? 'waitlist_approved' : 'waitlist_pending'
        );
        expect(committed[3]).toHaveLength(1);
        expect(committed[4]).toHaveLength(approval ? 1 : 0);
        await operate(0); // Ambiguous result reconciliation reuses existing state/token/job.
        expect(await snapshot()).toEqual(committed);
      });
    }

    it('pins actor/limits locally, blocks global helpers, cancels SQL, and reuses the connection', async () => {
      await runAtomicDbOperation(
        async tx => {
          const result = await tx.execute(
            drizzleSql`SELECT current_setting('app.clerk_user_id') AS actor, current_setting('statement_timeout') AS deadline`
          );
          expect(
            Array.from(
              result as unknown as { actor: string; deadline: string }[]
            )[0].actor
          ).toBe(actorId);
          expect(() => db.select()).toThrow('transaction handle');
        },
        { actorId, retry: 'never' }
      );
      await expect(
        runAtomicDbOperation(
          tx => tx.execute(drizzleSql`SELECT pg_sleep(0.2)`),
          { actorId, retry: 'never', timeoutMs: 50 }
        )
      ).rejects.toThrow();
      const [state] =
        await client`SELECT current_setting('app.clerk_user_id',true) AS actor, current_setting('statement_timeout') AS deadline, 1 AS ok`;
      expect(state).toMatchObject({ actor: '', deadline: '0', ok: 1 });
    });
  }
);
