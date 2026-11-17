import { randomUUID } from 'node:crypto';
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
import type { DbOrTransaction } from '@/lib/db';
import { profileActionApprovals } from '@/lib/db/schema/profile-approvals';
import {
  authorizeRiskyProfileAction,
  decideProfileApproval,
  listProfileApprovals,
  revokeProfileApproval,
} from '@/lib/team/approvals';
import { fixtureSchemaUrl as fixtureUrl } from './fixtures/fixture-schema-url';

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn().mockResolvedValue(undefined),
}));
const DIRECT_NEON_HOST = /^ep-[a-z0-9-]+\..*\.neon\.tech$/i;

function resolveTarget(env: Record<string, string | undefined>) {
  const local = env.APPROVAL_TEST_DATABASE_URL?.trim();
  if (local) {
    const parsed = new URL(local);
    if (
      parsed.hostname !== '127.0.0.1' ||
      parsed.pathname !== '/jov12105_approvals'
    ) {
      throw new Error('Only dedicated loopback approval fixtures are allowed');
    }
    return { url: parsed.toString(), certification: false };
  }
  if (env.DB_CERTIFICATION !== 'true') return null;
  if (!env.DATABASE_URL)
    throw new Error('Isolated certification requires DATABASE_URL');
  const parsed = new URL(env.DATABASE_URL);
  parsed.hostname = parsed.hostname.replace(
    /^(ep-[a-z0-9-]+?)-pooler\./,
    '$1.'
  );
  parsed.searchParams.delete('channel_binding');
  if (
    !DIRECT_NEON_HOST.test(parsed.hostname) ||
    parsed.hostname.includes('-pooler.')
  ) {
    throw new Error('Isolated certification requires a direct Neon endpoint');
  }
  return { url: parsed.toString(), certification: true };
}

const target = resolveTarget(process.env);
const owner = randomUUID();
const manager = randomUUID();
const profile = randomUUID();
const approval = randomUUID();

function barrier() {
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => {
    release = resolve;
  });
  const arrived = new Promise<void>(resolve => {
    entered = resolve;
  });
  return {
    release,
    arrived,
    pause: async () => {
      entered();
      await waiting;
    },
  };
}

// Pause after the production helper's approval SELECT, not after a test copy
// of its predicate. A competing real transaction then commits before its UPDATE.
function pauseApprovalRead<T extends object>(
  target: T,
  pause: () => Promise<void>,
  selected = false,
  mode: 'limit' | 'then' = 'limit'
): T {
  return new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (key === 'then' && selected && mode === 'then')
          return Promise.resolve(object)
            .then(async rows => {
              await pause();
              return rows;
            })
            .then(
              args[0] as (value: unknown) => unknown,
              args[1] as (reason: unknown) => unknown
            );
        const result = Reflect.apply(value, object, args);
        if (key === 'limit' && selected && mode === 'limit')
          return Promise.resolve(result).then(async rows => {
            await pause();
            return rows;
          });
        if (key === 'select' || key === 'from' || key === 'where') {
          return pauseApprovalRead(
            result,
            pause,
            key === 'from' ? args[0] === profileActionApprovals : selected,
            mode
          );
        }
        return result;
      };
    },
  });
}

describe.skipIf(!target)(
  'profile approval transitions on isolated real Postgres',
  () => {
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;
    const fixtureSchema = `approval_fixture_${randomUUID().replaceAll('-', '')}`;
    let schemaCreated = false;
    beforeAll(async () => {
      if (!target) throw new Error('Approval fixture target missing');
      client = postgres(fixtureUrl(target.url, fixtureSchema), {
        ...(target.certification ? { ssl: 'require' } : {}),
        max: 4,
        connection: {
          TimeZone: 'UTC',
          application_name: 'jov-approval-contention',
          statement_timeout: 3000,
          idle_in_transaction_session_timeout: 5000,
        },
      });
      // A schema shared by this fixture's connections is required for real lock
      // contention. No public fallback: a missing fixture table fails closed.
      await client`CREATE SCHEMA ${client(fixtureSchema)}`;
      schemaCreated = true;
      const [scope] = await client`SELECT current_schema() AS name`;
      if (scope.name !== fixtureSchema)
        throw new Error('Fixture schema isolation failed');
      db = drizzle(client);
      await client.unsafe(`
      CREATE TABLE IF NOT EXISTS creator_profiles (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE IF NOT EXISTS user_profile_claims (user_id uuid, creator_profile_id uuid, role text);
      CREATE TABLE IF NOT EXISTS profile_action_approvals (
        id uuid PRIMARY KEY, creator_profile_id uuid NOT NULL, action text NOT NULL,
        status text NOT NULL, requested_by uuid NOT NULL, decided_by uuid,
        payload jsonb, reason text, expires_at timestamp NOT NULL, decided_at timestamp,
        consumed_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
      CREATE TABLE IF NOT EXISTS profile_approval_events (
        id uuid DEFAULT gen_random_uuid(), approval_id uuid, creator_profile_id uuid,
        event text, actor_id uuid, metadata jsonb, created_at timestamp DEFAULT now());
    `);
    });
    beforeEach(async () => {
      await client`TRUNCATE profile_approval_events, profile_action_approvals, user_profile_claims, creator_profiles`;
      await client`INSERT INTO creator_profiles VALUES (${profile}, ${owner})`;
      await client`INSERT INTO user_profile_claims VALUES (${manager}, ${profile}, 'manager'), (${owner}, ${profile}, 'owner')`;
    });
    afterAll(async () => {
      try {
        if (schemaCreated)
          await client`DROP SCHEMA ${client(fixtureSchema)} CASCADE`;
      } finally {
        await client?.end({ timeout: 1 });
      }
    });
    const seed = async (status: string) => {
      await client`INSERT INTO profile_action_approvals (id, creator_profile_id, action, status, requested_by, expires_at) VALUES (${approval}, ${profile}, 'links.mutate', ${status}, ${manager}, now() + interval '1 hour')`;
    };
    const consume = (tx: DbOrTransaction) =>
      authorizeRiskyProfileAction(tx, {
        appUserId: manager,
        profileId: profile,
        action: 'links.mutate',
      });
    const revoke = (tx: DbOrTransaction) =>
      revokeProfileApproval(tx, { approvalId: approval, actorUserId: owner });
    const decide = (tx: DbOrTransaction) =>
      decideProfileApproval(tx, {
        approvalId: approval,
        actorUserId: owner,
        decision: 'approved',
      });
    const transact = <T>(operation: (tx: DbOrTransaction) => Promise<T>) =>
      db.transaction(tx => operation(tx as unknown as DbOrTransaction), {
        isolationLevel: 'read committed',
      });

    it('isolates all concurrent connections despite URL overrides and retains unrelated options', async () => {
      const url = new URL(target!.url);
      url.searchParams.set('search_path', 'public');
      url.searchParams.set(
        'options',
        '-c work_mem=2048kB -c search_path=public'
      );
      const probe = postgres(fixtureUrl(url.toString(), fixtureSchema), {
        max: 4,
        ...(target!.certification ? { ssl: 'require' as const } : {}),
      });
      const connections = [];
      try {
        for (let index = 0; index < 4; index++)
          connections.push(await probe.reserve());
        for (const connection of connections) {
          const [scope] =
            await connection`SELECT current_schema() AS name, current_setting('work_mem') AS work_mem,
            to_regclass('profile_action_approvals') = to_regclass(${`${fixtureSchema}.profile_action_approvals`}) AS isolated`;
          expect(scope).toMatchObject({
            name: fixtureSchema,
            isolated: true,
            work_mem: '2MB',
          });
        }
      } finally {
        for (const connection of connections) connection.release();
        await probe.end();
      }
    });

    it('allows one consumption and one audit event after competing stale reads', async () => {
      await seed('approved');
      const gate = barrier();
      const loser = transact(tx => consume(pauseApprovalRead(tx, gate.pause)));
      await gate.arrived;
      try {
        expect(await transact(consume)).toMatchObject({ status: 'allowed' });
      } finally {
        gate.release();
      }
      expect(await loser).toMatchObject({ status: 'requires_approval' });
      expect(await client`SELECT event FROM profile_approval_events`).toEqual([
        { event: 'consumed' },
      ]);
    });

    it('does not resurrect a revoked pending approval from a stale owner decision', async () => {
      await seed('pending');
      const gate = barrier();
      const loser = transact(tx => decide(pauseApprovalRead(tx, gate.pause)));
      await gate.arrived;
      try {
        expect(await transact(revoke)).toEqual({ ok: true });
      } finally {
        gate.release();
      }
      expect(await loser).toEqual({ ok: false, reason: 'not_pending' });
      expect(await client`SELECT status FROM profile_action_approvals`).toEqual(
        [{ status: 'revoked' }]
      );
      expect(await client`SELECT event FROM profile_approval_events`).toEqual([
        { event: 'revoked' },
      ]);
    });

    it.each(['consume-first', 'revoke-first'])(
      'linearizes consumption versus revocation: %s',
      async ordering => {
        await seed('approved');
        const gate = barrier();
        const staleOperation = ordering === 'consume-first' ? revoke : consume;
        const winner = ordering === 'consume-first' ? consume : revoke;
        const loser = transact(tx =>
          staleOperation(pauseApprovalRead(tx, gate.pause))
        );
        await gate.arrived;
        try {
          await transact(winner);
        } finally {
          gate.release();
        }
        expect(await loser).toMatchObject(
          ordering === 'consume-first'
            ? { ok: false, reason: 'not_pending' }
            : { status: 'requires_approval' }
        );
        expect(await client`SELECT event FROM profile_approval_events`).toEqual(
          [{ event: ordering === 'consume-first' ? 'consumed' : 'revoked' }]
        );
      }
    );

    it('does not overwrite revocation or emit stale expiry events', async () => {
      await seed('approved');
      await client`UPDATE profile_action_approvals SET expires_at = now() - interval '1 hour'`;
      const gate = barrier();
      const expiry = transact(tx =>
        listProfileApprovals(pauseApprovalRead(tx, gate.pause, false, 'then'), {
          profileId: profile,
          appUserId: owner,
        })
      );
      await gate.arrived;
      try {
        expect(await transact(revoke)).toEqual({ ok: true });
      } finally {
        gate.release();
      }
      await expiry;
      expect(await client`SELECT status FROM profile_action_approvals`).toEqual(
        [{ status: 'revoked' }]
      );
      expect(await client`SELECT event FROM profile_approval_events`).toEqual([
        { event: 'revoked' },
      ]);
    });

    it('accepts only one decision from two stale pending snapshots', async () => {
      await seed('pending');
      const gate = barrier();
      const loser = transact(tx => decide(pauseApprovalRead(tx, gate.pause)));
      await gate.arrived;
      try {
        expect(
          await transact(tx =>
            decideProfileApproval(tx, {
              approvalId: approval,
              actorUserId: owner,
              decision: 'rejected',
            })
          )
        ).toEqual({ ok: true });
      } finally {
        gate.release();
      }
      expect(await loser).toEqual({ ok: false, reason: 'not_pending' });
      expect(await client`SELECT status FROM profile_action_approvals`).toEqual(
        [{ status: 'rejected' }]
      );
      expect(await client`SELECT event FROM profile_approval_events`).toEqual([
        { event: 'rejected' },
      ]);
    });

    it('rejects a grant that expires after its eligibility read', async () => {
      await seed('approved');
      const gate = barrier();
      const pendingUse = transact(tx =>
        consume(pauseApprovalRead(tx, gate.pause))
      );
      await gate.arrived;
      try {
        await client`UPDATE profile_action_approvals SET expires_at = clock_timestamp() + interval '20 milliseconds'`;
        // A database-clock expiry test necessarily crosses the deadline. This is
        // isolated integration evidence, not a sleep-based UI synchronization.
        await client`SELECT pg_sleep(0.03)`;
      } finally {
        gate.release();
      }
      expect(await pendingUse).toMatchObject({ status: 'requires_approval' });
      expect(await client`SELECT event FROM profile_approval_events`).toEqual(
        []
      );
    });

    it.each(['consume', 'decision'])(
      'rejects %s after waiting on a row lock beyond expiry',
      async operation => {
        await seed(operation === 'consume' ? 'approved' : 'pending');
        await client`UPDATE profile_action_approvals SET expires_at = clock_timestamp() + interval '1 second'`;
        const locked = barrier();
        const holder = client.begin(async sql => {
          await sql`SELECT id FROM profile_action_approvals WHERE id = ${approval} FOR UPDATE`;
          await locked.pause();
        });
        await locked.arrived;
        const protectedWrite = vi.fn();
        const waiting = transact(async tx => {
          const result =
            operation === 'consume' ? await consume(tx) : await decide(tx);
          if ('status' in result ? result.status === 'allowed' : result.ok)
            protectedWrite();
          return result;
        });
        try {
          await expect
            .poll(
              async () => {
                const rows =
                  await client`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = 'jov-approval-contention' AND cardinality(pg_blocking_pids(pid)) > 0`;
                return rows[0].waiting;
              },
              { timeout: 2000, interval: 10 }
            )
            .toBeGreaterThan(0);
          await client`SELECT pg_sleep(greatest(0, extract(epoch FROM (expires_at AT TIME ZONE 'UTC' - clock_timestamp()))) + 0.02) FROM profile_action_approvals WHERE id = ${approval}`;
        } finally {
          locked.release();
        }
        await holder;
        expect(await waiting).toMatchObject(
          operation === 'consume'
            ? { status: 'requires_approval' }
            : { ok: false, reason: 'not_pending' }
        );
        expect(protectedWrite).not.toHaveBeenCalled();
        expect(await client`SELECT event FROM profile_approval_events`).toEqual(
          []
        );
      }
    );

    it('rolls the consumed grant and audit back with failed protected work', async () => {
      await seed('approved');
      await expect(
        transact(async tx => {
          expect(await consume(tx)).toMatchObject({ status: 'allowed' });
          throw new Error('protected write failed');
        })
      ).rejects.toThrow('protected write failed');
      expect(
        await client`SELECT consumed_at FROM profile_action_approvals`
      ).toEqual([{ consumed_at: null }]);
      expect(await client`SELECT event FROM profile_approval_events`).toEqual(
        []
      );
      expect(await transact(consume)).toMatchObject({ status: 'allowed' });
    });
  }
);

describe('approval database target admission', () => {
  it('pins schema last without discarding unrelated URL options', () => {
    const url = new URL(
      fixtureUrl(
        'postgres://127.0.0.1/jov12105_approvals?search_path=public&options=-c%20work_mem%3D2048kB%20-c%20search_path%3Dpublic',
        'fixture_only'
      )
    );
    expect(url.searchParams.has('search_path')).toBe(false);
    expect(url.searchParams.get('options')).toBe(
      '-c work_mem=2048kB -c search_path=public -c search_path=fixture_only'
    );
  });

  it('does not opt into a database from DATABASE_URL alone', () => {
    expect(
      resolveTarget({ DATABASE_URL: 'postgres://example.test/db' })
    ).toBeNull();
  });
  it('keeps the dedicated loopback restriction', () => {
    expect(
      resolveTarget({
        APPROVAL_TEST_DATABASE_URL: 'postgres://127.0.0.1/jov12105_approvals',
      })
    ).toMatchObject({ certification: false });
    expect(() =>
      resolveTarget({
        APPROVAL_TEST_DATABASE_URL:
          'postgres://example.test/jov12105_approvals',
      })
    ).toThrow('loopback');
    expect(() =>
      resolveTarget({
        APPROVAL_TEST_DATABASE_URL: 'postgres://127.0.0.1/other',
      })
    ).toThrow('loopback');
  });
  it('requires an explicit certification endpoint and adapts only the canonical Neon pooler', () => {
    expect(() => resolveTarget({ DB_CERTIFICATION: 'true' })).toThrow(
      'DATABASE_URL'
    );
    expect(() =>
      resolveTarget({
        DB_CERTIFICATION: 'true',
        DATABASE_URL: 'postgres://example.test/db',
      })
    ).toThrow('Neon');
    const result = resolveTarget({
      DB_CERTIFICATION: 'true',
      DATABASE_URL:
        'postgres://ep-fixture-pooler.us-east-2.aws.neon.tech/db?channel_binding=require',
    });
    expect(result).toEqual({
      url: 'postgres://ep-fixture.us-east-2.aws.neon.tech/db',
      certification: true,
    });
  });
});
