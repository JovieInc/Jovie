import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import {
  DEFAULT_HOME_SPEC,
  MARKETING_PAGE_KIND,
} from '@/lib/content-records/marketing-page';
import type { ContentReviewIdentity } from '@/lib/content-records/publication';
import * as store from '@/lib/content-records/store.server';
import { getInternalDb, setInternalDb } from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';

// Only external seams are fixtures. SQL, constraints, the atomic wrapper,
// production store, conditional pointer writes and audit records remain real.
const state = vi.hoisted(() => ({
  cacheFails: false,
  loseCommitAck: false,
  transactions: 0,
}));
vi.mock('@/lib/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  doesTableExist: async (table: string) =>
    [
      'content_record_live',
      'content_record_versions',
      'content_record_events',
    ].includes(table),
}));
vi.mock('@/lib/content-records/access.server', () => ({
  resolveContentApprover: async () => ({
    ok: true,
    actor: 'user:content-cert-founder',
  }),
}));
vi.mock('@/lib/ovie/summer-founder-auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ovie/summer-founder-auth')>()),
  authorizeFounderSummerUser: (id: string) =>
    id === 'content-cert-founder' ? 'authorized' : 'forbidden',
}));
vi.mock('@/lib/observability/build-info', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/observability/build-info')>()),
  getDeployedBuildInfo: async () => ({
    commitSha: 'a'.repeat(40),
    buildId: 'content-cert-build',
  }),
}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: () => {
    if (state.cacheFails) throw new Error('injected cache failure');
  },
  revalidatePath: () => {},
}));

type Target = {
  readonly url: string;
  readonly mode: 'loopback' | 'certification';
};

function fixtureUrl(target: Target, schema: string) {
  // Neon documents options=-c search_path=... for direct connections; a
  // standalone startup search_path did not survive the hosted boundary.
  // https://neon.com/docs/guides/prisma#setting-the-search-path-for-raw-sql-queries
  const url = new URL(target.url);
  const options = url.searchParams.get('options')?.trim();
  url.searchParams.delete('search_path');
  url.searchParams.set(
    'options',
    [options, `-c search_path=${schema}`].filter(Boolean).join(' ')
  );
  return url;
}

function fixtureClient(target: Target, schema: string) {
  return postgres(fixtureUrl(target, schema).toString(), {
    max: 2,
    connect_timeout: 10,
    connection: { statement_timeout: 10_000 },
    ...(target.mode === 'certification' ? { ssl: 'require' as const } : {}),
  });
}

async function assertFixtureSessions(
  pool: ReturnType<typeof postgres>,
  schema: string
) {
  const first = await pool.reserve();
  try {
    const second = await pool.reserve();
    try {
      for (const session of [first, second]) {
        const [row] = await session`
          SELECT current_schema() AS schema_name,
            to_regclass('failure_control')::oid AS actual_control,
            to_regclass(${`${schema}.failure_control`})::oid AS expected_control`;
        expect(row.schema_name).toBe(schema);
        expect(row.expected_control).not.toBeNull();
        expect(row.actual_control).toBe(row.expected_control);
      }
    } finally {
      second.release();
    }
  } finally {
    first.release();
  }
}
const definition = {
  ...MARKETING_PAGE_KIND,
  renderSmoke: async ({ identity }: { identity: ContentReviewIdentity }) => ({
    reviewDigest: identity.reviewDigest,
    versionId: identity.versionId,
    renderBuildId: identity.renderBuildId,
    errors: [],
  }),
};

/** Registered under the existing isolated-Postgres certification suite. */
export function registerContentPublicationCertification(
  getTarget: () => Target | null
) {
  describe('content publication on real Postgres', () => {
    const schema = `jovie_content_cert_${randomUUID().replaceAll('-', '')}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let previousDb: DbType | undefined;
    let installed = false;
    let created = false;

    beforeAll(async () => {
      const target = getTarget();
      if (!target)
        throw new Error('Isolated certification database is required');
      const url = new URL(target.url);
      if (
        target.mode === 'loopback' &&
        (url.hostname !== '127.0.0.1' || url.pathname !== '/jov6269_atomic')
      ) {
        throw new Error('Disposable loopback database required');
      }
      const ssl =
        target.mode === 'certification' ? { ssl: 'require' as const } : {};
      admin = postgres(target.url, {
        max: 1,
        connect_timeout: 10,
        connection: { statement_timeout: 10_000 },
        ...ssl,
      });
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);
      created = true;
      // Apply the actual source migration only inside this new isolated schema.
      const ddl = readFileSync(
        resolve(process.cwd(), 'drizzle/migrations/0149_content_records.sql'),
        'utf8'
      )
        .replaceAll('"public".', '')
        .replace(
          /"(content_record_events|content_record_live|content_record_versions)"/g,
          `"${schema}"."$1"`
        );
      for (const statement of ddl.split('--> statement-breakpoint')) {
        if (statement.trim()) await admin.unsafe(statement);
      }
      await admin.unsafe(`CREATE TABLE "${schema}".failure_control (fail_after integer NOT NULL, writes integer NOT NULL);
        INSERT INTO "${schema}".failure_control VALUES (0,0)`);
      await admin.unsafe(`CREATE FUNCTION "${schema}".inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE seen integer; fail integer;
        BEGIN
          UPDATE "${schema}".failure_control SET writes=writes+1 RETURNING writes,fail_after INTO seen,fail;
          IF seen=fail THEN RAISE EXCEPTION 'injected publication write %',seen; END IF;
          RETURN NEW;
        END $$`);
      for (const table of ['content_record_live', 'content_record_events']) {
        await admin.unsafe(`CREATE TRIGGER publication_failure AFTER INSERT OR UPDATE ON "${schema}"."${table}"
          FOR EACH STATEMENT EXECUTE FUNCTION "${schema}".inject_failure()`);
      }
      // Each concurrent transaction has a real connection and sees only the
      // fixture schema. No production tables are read, truncated or dropped.
      client = fixtureClient(target, schema);
      // Fail before unqualified fixture or store writes if isolation was lost.
      await assertFixtureSessions(client, schema);
      previousDb = getInternalDb();
      const database = drizzle(client);
      const faultableDatabase = new Proxy(database, {
        get(target, property, receiver) {
          if (property !== 'transaction')
            return Reflect.get(target, property, receiver);
          return async (...args: unknown[]) => {
            state.transactions += 1;
            // The actual database transaction and COMMIT finish first. Only
            // their acknowledgement is lost at this explicit driver seam.
            const committed: unknown = await Reflect.apply(
              target.transaction,
              target,
              args
            );
            if (state.loseCommitAck) {
              state.loseCommitAck = false;
              throw new Error('injected lost COMMIT acknowledgement');
            }
            return committed;
          };
        },
      });
      setInternalDb(faultableDatabase as unknown as DbType);
      installed = true;
    }, 60_000);

    afterAll(async () => {
      const errors: unknown[] = [];
      try {
        if (installed) setInternalDb(previousDb);
      } finally {
        try {
          await client?.end({ timeout: 3 });
        } catch (error) {
          errors.push(error);
        } finally {
          try {
            if (created) await admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
          } catch (error) {
            errors.push(error);
          } finally {
            try {
              await admin?.end({ timeout: 3 });
            } catch (error) {
              errors.push(error);
            }
          }
        }
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          'Content certification cleanup failed'
        );
    }, 30_000);

    beforeEach(async () => {
      state.cacheFails = false;
      state.loseCommitAck = false;
      await client.unsafe(
        'TRUNCATE content_record_live,content_record_events,content_record_versions'
      );
      await client.unsafe('UPDATE failure_control SET fail_after=0,writes=0');
    });

    async function draft() {
      const data = structuredClone(DEFAULT_HOME_SPEC);
      const hero = data.sections[0];
      if (hero?.section === 'hero')
        hero.copy.subhead = 'A free profile for you.';
      return store.createContentVersion(definition, {
        key: 'home',
        data,
        author: 'agent:certification',
      });
    }
    async function seedPointer(id: string) {
      await client`INSERT INTO content_record_live(kind,record_key,version_id,published_at,published_by)
        VALUES ('marketing-page','home',${id},${new Date('2026-01-01').toISOString()},'fixture')`;
    }
    async function intent(
      versionId: string,
      expectedLiveVersionId: string | null
    ) {
      const identity = await store.getContentReviewIdentity(
        definition,
        'home',
        versionId
      );
      if (!identity) throw new Error('Fixture renderer identity missing');
      const decisionId = randomUUID();
      await store.approveContentVersion(
        definition,
        {
          key: 'home',
          versionId,
          decisionId,
          reviewDigest: identity.reviewDigest,
          expectedLiveVersionId,
        },
        new Request('https://jov.ie')
      );
      return {
        key: 'home',
        versionId,
        expectedLiveVersionId,
        approvalId: decisionId,
        operationId: randomUUID(),
        actor: 'agent:certification',
        reason: 'fixture publication',
      };
    }
    const snapshot = async () =>
      Promise.all([
        client`SELECT * FROM content_record_live ORDER BY kind,record_key`,
        client`SELECT * FROM content_record_events ORDER BY id`,
        client`SELECT * FROM content_record_versions ORDER BY id`,
      ]);

    it('pins both fixture sessions when the URL requests public search_path', async () => {
      const target = getTarget();
      if (!target)
        throw new Error('Isolated certification database is required');
      const url = new URL(target.url);
      url.searchParams.set('search_path', 'public');
      const probe = fixtureClient({ ...target, url: url.toString() }, schema);
      try {
        await assertFixtureSessions(probe, schema);
      } finally {
        await probe.end({ timeout: 3 });
      }
    });

    it('binds the schema through supported startup options and preserves other settings', async () => {
      const target = getTarget();
      if (!target)
        throw new Error('Isolated certification database is required');
      const url = new URL(target.url);
      url.searchParams.set(
        'options',
        '-c work_mem=2048kB -c search_path=public'
      );
      const forwarded = fixtureUrl({ ...target, url: url.toString() }, schema);
      // Model the hosted boundary that ignored standalone search_path: only
      // the documented direct-connection options may carry schema scope.
      forwarded.searchParams.delete('search_path');
      const probe = postgres(forwarded.toString(), {
        max: 2,
        connect_timeout: 10,
        connection: { statement_timeout: 10_000 },
        ...(target.mode === 'certification' ? { ssl: 'require' as const } : {}),
      });
      try {
        await assertFixtureSessions(probe, schema);
        const [row] = await probe`
          SELECT current_setting('work_mem') AS work_mem`;
        expect(row.work_mem).toBe('2MB');
      } finally {
        await probe.end({ timeout: 3 });
      }
    });

    it('rolls back both write boundaries, then commits and reconciles without duplicate history', async () => {
      const prior = await draft();
      const next = await draft();
      await seedPointer(prior.id);
      const input = await intent(next.id, prior.id);
      const before = await snapshot();
      for (const failAfter of [1, 2]) {
        await client`UPDATE failure_control SET fail_after=${failAfter},writes=0`;
        await expect(
          store.publishContentVersion(definition, input)
        ).rejects.toBeInstanceOf(store.ContentPublicationUncertainError);
        expect(await snapshot()).toEqual(before);
        expect(
          await client`SELECT id FROM content_record_events WHERE id=${input.operationId}`
        ).toHaveLength(0);
      }
      await client`UPDATE failure_control SET fail_after=0,writes=0`;
      const move = await store.publishContentVersion(definition, input);
      expect(move).toMatchObject({
        toVersionId: next.id,
        readback: { source: 'live', versionId: next.id },
        delivery: 'unverified',
      });
      const committed = await snapshot();
      await expect(
        store.publishContentVersion(definition, input)
      ).resolves.toMatchObject({ operationId: input.operationId });
      expect(await snapshot()).toEqual(committed);
      state.cacheFails = true;
      await expect(
        store.publishContentVersion(definition, input)
      ).resolves.toMatchObject({
        cacheInvalidation: 'uncertain',
        delivery: 'unverified',
      });
      expect(await snapshot()).toEqual(committed);
    });

    it('reconciles a real committed transaction whose driver acknowledgement was lost', async () => {
      const prior = await draft();
      const next = await draft();
      await seedPointer(prior.id);
      const input = await intent(next.id, prior.id);
      const before = state.transactions;
      state.loseCommitAck = true;
      await expect(
        store.publishContentVersion(definition, input)
      ).resolves.toMatchObject({
        operationId: input.operationId,
        toVersionId: next.id,
        delivery: 'unverified',
      });
      expect(state.transactions - before).toBe(1);
      expect(
        await client`SELECT id FROM content_record_events WHERE id=${input.operationId}`
      ).toHaveLength(1);
      const committed = await snapshot();
      await store.publishContentVersion(definition, input);
      expect(state.transactions - before).toBe(1);
      expect(await snapshot()).toEqual(committed);
    });

    for (const initial of [true, false]) {
      it(`keeps one winner for concurrent ${initial ? 'initial' : 'existing'} publication`, async () => {
        const prior = initial ? null : await draft();
        if (prior) await seedPointer(prior.id);
        const first = await draft();
        const second = await draft();
        const expected = prior?.id ?? null;
        const inputs = [
          await intent(first.id, expected),
          await intent(second.id, expected),
        ];
        const results = await Promise.allSettled(
          inputs.map(input => store.publishContentVersion(definition, input))
        );
        expect(
          results.filter(result => result.status === 'fulfilled')
        ).toHaveLength(1);
        expect(
          results.filter(result => result.status === 'rejected')
        ).toHaveLength(1);
        const [live] = await client`SELECT version_id FROM content_record_live`;
        expect([first.id, second.id]).toContain(live.version_id);
        const published =
          await client`SELECT * FROM content_record_events WHERE action='publish'`;
        expect(published).toHaveLength(1);
        expect(published[0].to_version_id).toBe(live.version_id);
      });
    }

    it('preserves rollback target and history across default retries and schema drift', async () => {
      const prior = await draft();
      const next = await draft();
      await seedPointer(prior.id);
      await store.publishContentVersion(
        definition,
        await intent(next.id, prior.id)
      );
      const approved = await intent(prior.id, next.id);
      const { versionId: _versionId, ...rollback } = approved;
      await expect(
        store.rollbackContent(definition, rollback)
      ).resolves.toMatchObject({ toVersionId: prior.id });
      const committed = await snapshot();
      await expect(
        store.rollbackContent(definition, rollback)
      ).resolves.toMatchObject({ toVersionId: prior.id });
      expect(await snapshot()).toEqual(committed);
      await expect(
        store.rollbackContent({ ...definition, schemaVersion: 2 }, rollback)
      ).resolves.toMatchObject({
        toVersionId: prior.id,
        readback: { source: 'default', versionId: null },
        delivery: 'unverified',
      });
      expect(await snapshot()).toEqual(committed);
    });
  });
}
