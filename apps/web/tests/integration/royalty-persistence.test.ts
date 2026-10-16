import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { DbOrTransaction, DbType } from '@/lib/db';
import { financeLedgerEvents } from '@/lib/db/schema/finance';
import {
  royaltySources,
  royaltyStatementLines,
  royaltyStatementVersions,
} from '@/lib/db/schema/royalties';
import { setupRoyaltyDatabase } from '../test-utils/db/royalty-database';

const auth = vi.hoisted(() => ({
  owner: null as string | null,
  key: 'synthetic-royalty-test-key' as string | undefined,
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: auth.owner }),
}));
vi.mock('@/lib/env-server', () => ({
  env: {
    NODE_ENV: 'test',
    get PII_ENCRYPTION_KEY() {
      return auth.key;
    },
  },
  isTestEnv: () => true,
}));
vi.mock('@/lib/auth/session', () => ({
  UnauthorizedSessionError: class extends Error {},
  withDbSessionTx: async (
    fn: (tx: DbOrTransaction) => Promise<unknown>,
    options: { clerkUserId: string }
  ) => scoped(options.clerkUserId, fn),
}));

import {
  deleteRoyaltySource,
  listRoyaltyStatementLines,
  listRoyaltyStatementVersions,
  persistRoyaltyStatement,
  purgeExpiredRoyaltySources,
  type RoyaltyImport,
  readRoyaltySourceEvidence,
} from '@/lib/finance/royalty-repository';

let db: DbType;
let close: () => Promise<void>;
const ownerA = randomUUID();
const ownerB = randomUUID();
const connectorA = randomUUID();
const connectorB = randomUUID();
const profileId = randomUUID();
async function scoped<T>(
  owner: string,
  fn: (tx: DbOrTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(drizzleSql`SET LOCAL ROLE test_app_user`);
    await tx.execute(
      drizzleSql`SELECT set_config('app.clerk_user_id', ${owner}, true)`
    );
    return fn(tx);
  });
}
function input(overrides: Partial<RoyaltyImport> = {}): RoyaltyImport {
  return {
    connectorAccountId: auth.owner === ownerB ? connectorB : connectorA,
    importKey: randomUUID(),
    statementKey: randomUUID(),
    version: 1,
    parserVersion: 'test-v1',
    evidence: Buffer.from('private statement,\u0000 original bytes\n'),
    expiresAt: new Date(Date.now() + 60_000),
    lines: [
      {
        rowIdentity: 'row-1',
        rowNumber: 1,
        sourceRowHash: 'b'.repeat(64),
        amount: '0.0000000001234500',
        currency: 'USD',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  auth.key = 'synthetic-royalty-test-key';
  auth.owner = ownerA;
});
afterEach(() => vi.useRealTimers());
beforeAll(async () => {
  ({ db, close } = await setupRoyaltyDatabase());
  await db.execute(
    drizzleSql`INSERT INTO users (id, email, user_status) VALUES (${ownerA}, ${`${ownerA}@example.test`}, 'active'), (${ownerB}, ${`${ownerB}@example.test`}, 'active')`
  );
  await db.transaction(async tx => {
    await tx.execute(
      drizzleSql`SELECT set_config('app.clerk_user_id', 'system_royalty_fixture', true)`
    );
    await tx.execute(
      drizzleSql`INSERT INTO creator_profiles (id, user_id, creator_type, username, username_normalized, is_public) VALUES (${profileId}, ${ownerA}, 'artist', ${profileId}, ${profileId}, true)`
    );
    await tx.execute(
      drizzleSql`INSERT INTO user_profile_claims (user_id, creator_profile_id, role) VALUES (${ownerB}, ${profileId}, 'manager')`
    );
  });
  await db.execute(
    drizzleSql`INSERT INTO connector_accounts (id, user_id, provider, provider_account_id) VALUES (${connectorA}, ${ownerA}, 'gmail', 'royalty-a'), (${connectorB}, ${ownerB}, 'gmail', 'royalty-b')`
  );
}, 120_000);
afterAll(async () => {
  if (db) {
    await scoped(ownerA, tx =>
      tx.execute(
        drizzleSql`DELETE FROM creator_profiles WHERE id = ${profileId}`
      )
    );
    await db.execute(
      drizzleSql`DELETE FROM users WHERE id IN (${ownerA}, ${ownerB})`
    );
  }
  await close?.();
});

describe('royalty persistence with actual PostgreSQL RLS', () => {
  it('round-trips original bytes, tiny/large/negative decimals, currency and nullable FX without rounding', async () => {
    auth.owner = ownerA;
    const original = input();
    const amounts = [
      '0.0000000001234500',
      '123456789012345678901234567890.12345678901234567890',
      '-0.00000000000000100',
    ];
    original.lines = amounts.map((amount, i) => ({
      ...original.lines[0],
      rowIdentity: `row-${i}`,
      rowNumber: i + 1,
      amount,
      currency: i ? 'JPY' : 'USD',
      fxRate: i ? '1.123456789012345678900' : null,
      fxCurrency: i ? 'EUR' : null,
    }));
    const receipt = await persistRoyaltyStatement(original);
    const rows = await listRoyaltyStatementLines(receipt.statementVersionId);
    expect(rows.map(row => row.amount)).toEqual(amounts);
    expect(rows.map(row => row.currency)).toEqual(['USD', 'JPY', 'JPY']);
    expect(rows[0]).toMatchObject({
      fxRate: null,
      fxCurrency: null,
      fxAsOf: null,
    });
    expect(rows[1].fxRate).toBe('1.123456789012345678900');
    expect(
      Buffer.from((await readRoyaltySourceEvidence(receipt.sourceId))!)
    ).toEqual(Buffer.from(original.evidence));
    const [stored] = await scoped(ownerA, tx =>
      tx
        .select()
        .from(royaltySources)
        .where(eq(royaltySources.id, receipt.sourceId))
    );
    expect(stored.encryptedEvidence).not.toContain('private statement');
    expect(stored.encryptedEvidence.split(':')).toHaveLength(3);
    const events = await scoped(ownerA, tx =>
      tx
        .select()
        .from(financeLedgerEvents)
        .where(eq(financeLedgerEvents.entityId, receipt.sourceId))
    );
    expect(events.map(event => event.payload)).toEqual([
      { sourceHash: receipt.sourceHash },
    ]);
  });
  it('denies unauthenticated and cross-owner evidence, versions, lines, writes and erasure', async () => {
    auth.owner = ownerA;
    const original = input();
    const receipt = await persistRoyaltyStatement(original);
    auth.owner = null;
    await expect(readRoyaltySourceEvidence(receipt.sourceId)).rejects.toThrow();
    auth.owner = ownerB;
    const shared = await scoped(ownerB, tx =>
      tx.execute(
        drizzleSql`SELECT creator_profile_id FROM user_profile_claims WHERE user_id = ${ownerB}`
      )
    );
    const claims = 'rows' in shared ? shared.rows : shared;
    expect(claims).toHaveLength(1);
    expect(await readRoyaltySourceEvidence(receipt.sourceId)).toBeNull();
    expect(await listRoyaltyStatementVersions(original.statementKey)).toEqual(
      []
    );
    expect(await listRoyaltyStatementLines(receipt.statementVersionId)).toEqual(
      []
    );
    expect(await deleteRoyaltySource(receipt.sourceId)).toBe(false);
    await expect(
      persistRoyaltyStatement(input({ connectorAccountId: connectorA }))
    ).rejects.toThrow();
    await expect(
      scoped(ownerB, tx =>
        tx.insert(royaltyStatementVersions).values({
          ownerUserId: ownerB,
          sourceId: receipt.sourceId,
          statementKey: randomUUID(),
          version: 1,
          parserVersion: 'test',
        })
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerB, tx =>
        tx.insert(royaltySources).values({
          ownerUserId: ownerA,
          connectorAccountId: connectorA,
          importKey: randomUUID(),
          sourceHash: 'a'.repeat(64),
          encryptedEvidence: 'denied',
          expiresAt: new Date(Date.now() + 10000),
        })
      )
    ).rejects.toThrow();
    for (const actor of ['', 'system_royalty', randomUUID(), ownerB]) {
      const rows = await scoped(actor, tx =>
        tx
          .select()
          .from(royaltySources)
          .where(eq(royaltySources.id, receipt.sourceId))
      );
      expect(rows).toEqual([]);
    }
    const flags = await db.execute(
      drizzleSql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('royalty_sources','royalty_statement_versions','royalty_statement_lines')`
    );
    const flagRows = ('rows' in flags ? flags.rows : flags) as Array<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>;
    expect(flagRows).toHaveLength(3);
    expect(
      flagRows.every(row => row.relrowsecurity && row.relforcerowsecurity)
    ).toBe(true);
  });
  it('rolls back all evidence, versions, lines and audits when row persistence fails', async () => {
    auth.owner = ownerA;
    const before = await scoped(ownerA, tx =>
      tx.select().from(financeLedgerEvents)
    );
    const original = input();
    original.lines.push({ ...original.lines[0] });
    await expect(persistRoyaltyStatement(original)).rejects.toHaveProperty(
      'cause.code',
      '23505'
    );
    expect(await listRoyaltyStatementVersions(original.statementKey)).toEqual(
      []
    );
    expect(
      await scoped(ownerA, tx =>
        tx
          .select()
          .from(royaltySources)
          .where(eq(royaltySources.importKey, original.importKey))
      )
    ).toEqual([]);
    expect(
      await scoped(ownerA, tx => tx.select().from(financeLedgerEvents))
    ).toHaveLength(before.length);
  });
  it('rolls back persistence if canonical audit insertion fails', async () => {
    auth.owner = ownerA;
    const original = input();
    await db.execute(
      drizzleSql.raw(
        `CREATE FUNCTION fail_royalty_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER fail_royalty_audit_test BEFORE INSERT ON finance_ledger_events FOR EACH ROW WHEN (NEW.entity_kind = 'royalty_statement_version') EXECUTE FUNCTION fail_royalty_audit_test();`
      )
    );
    try {
      await expect(persistRoyaltyStatement(original)).rejects.toHaveProperty(
        'cause.message',
        'synthetic audit failure'
      );
      expect(
        await scoped(ownerA, tx =>
          tx
            .select()
            .from(royaltySources)
            .where(eq(royaltySources.importKey, original.importKey))
        )
      ).toEqual([]);
    } finally {
      await db.execute(
        drizzleSql.raw(
          'DROP TRIGGER fail_royalty_audit_test ON finance_ledger_events; DROP FUNCTION fail_royalty_audit_test();'
        )
      );
    }
  });
  it('appends corrections, rejects duplicate identities, and seals historical rows and audit events', async () => {
    auth.owner = ownerA;
    const original = input();
    const receipt = await persistRoyaltyStatement(original);
    await persistRoyaltyStatement(
      input({ statementKey: original.statementKey, version: 2 })
    );
    expect(
      (await listRoyaltyStatementVersions(original.statementKey)).map(
        row => row.version
      )
    ).toEqual([1, 2]);
    await expect(persistRoyaltyStatement(original)).rejects.toThrow();
    await expect(
      persistRoyaltyStatement(input({ statementKey: original.statementKey }))
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx
          .update(royaltySources)
          .set({ sourceHash: 'c'.repeat(64) })
          .where(eq(royaltySources.id, receipt.sourceId))
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx
          .update(royaltyStatementVersions)
          .set({ version: 3 })
          .where(eq(royaltyStatementVersions.id, receipt.statementVersionId))
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx
          .update(royaltyStatementLines)
          .set({ amount: '5' })
          .where(
            eq(
              royaltyStatementLines.statementVersionId,
              receipt.statementVersionId
            )
          )
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx
          .delete(royaltyStatementLines)
          .where(
            eq(
              royaltyStatementLines.statementVersionId,
              receipt.statementVersionId
            )
          )
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx.insert(royaltyStatementLines).values({
          ...original.lines[0],
          ownerUserId: ownerA,
          statementVersionId: receipt.statementVersionId,
          rowIdentity: 'late',
          rowNumber: 2,
        })
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx
          .update(financeLedgerEvents)
          .set({ payload: {} })
          .where(eq(financeLedgerEvents.entityId, receipt.sourceId))
      )
    ).rejects.toThrow();
    await expect(
      scoped(ownerA, tx =>
        tx
          .delete(financeLedgerEvents)
          .where(eq(financeLedgerEvents.entityId, receipt.sourceId))
      )
    ).rejects.toThrow();
    expect(await deleteRoyaltySource(receipt.sourceId)).toBe(true);
    expect(await listRoyaltyStatementLines(receipt.statementVersionId)).toEqual(
      []
    );
    const events = await scoped(ownerA, tx =>
      tx
        .select()
        .from(financeLedgerEvents)
        .where(eq(financeLedgerEvents.entityId, receipt.sourceId))
    );
    expect(events.map(event => event.eventKind).sort()).toEqual([
      'royalty_source_deleted',
      'royalty_source_persisted',
    ]);
  });
  it('fails closed on missing encryption, invalid decimals and expired retention', async () => {
    auth.owner = ownerA;
    const original = input();
    auth.key = undefined;
    await expect(persistRoyaltyStatement(original)).rejects.toThrow(
      'encryption unavailable'
    );
    auth.key = 'synthetic-royalty-test-key';
    for (const amount of [1, 'NaN', '1e-7', 'Infinity']) {
      await expect(
        persistRoyaltyStatement({
          ...original,
          lines: [
            { ...original.lines[0], amount } as RoyaltyImport['lines'][number],
          ],
        })
      ).rejects.toThrow();
    }
    await expect(
      persistRoyaltyStatement({ ...original, expiresAt: new Date(0) })
    ).rejects.toThrow();
    expect(await listRoyaltyStatementVersions(original.statementKey)).toEqual(
      []
    );
  });
  it('expires evidence and cascades retention, then erases artifacts and audit on soft owner deletion', async () => {
    auth.owner = ownerB;
    const original = input({ expiresAt: new Date(Date.now() + 2000) });
    const receipt = await persistRoyaltyStatement(original);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 3000));
    expect(await readRoyaltySourceEvidence(receipt.sourceId)).toBeNull();
    expect(await purgeExpiredRoyaltySources()).toBe(1);
    vi.useRealTimers();
    expect(await listRoyaltyStatementLines(receipt.statementVersionId)).toEqual(
      []
    );
    const retained = await persistRoyaltyStatement(input());
    await db.transaction(async tx => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.clerk_user_id', ${ownerB}, true)`
      );
      await tx.execute(
        drizzleSql`UPDATE users SET deleted_at = now() WHERE id = ${ownerB}`
      );
    });
    expect(
      await scoped(ownerB, tx =>
        tx
          .select()
          .from(royaltySources)
          .where(eq(royaltySources.ownerUserId, ownerB))
      )
    ).toEqual([]);
    expect(
      await scoped(ownerB, tx =>
        tx
          .select()
          .from(royaltyStatementLines)
          .where(
            eq(
              royaltyStatementLines.statementVersionId,
              retained.statementVersionId
            )
          )
      )
    ).toEqual([]);
    expect(
      await scoped(ownerB, tx =>
        tx
          .select()
          .from(financeLedgerEvents)
          .where(eq(financeLedgerEvents.ownerUserId, ownerB))
      )
    ).toEqual([]);
    await expect(readRoyaltySourceEvidence(retained.sourceId)).rejects.toThrow(
      'Financial owner unavailable'
    );
  });
});
