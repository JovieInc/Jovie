import 'server-only';

import { createHash } from 'node:crypto';
import { and, asc, eq, getTableColumns, gt, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { lockActiveRoyaltyOwner } from '@/lib/db/royalty-owner';
import {
  royaltySources,
  royaltyStatementLines,
  royaltyStatementVersions,
} from '@/lib/db/schema/royalties';
import {
  decryptPII,
  encryptPII,
  isPIIEncryptionEnabled,
} from '@/lib/utils/pii-encryption';
import { requireFinancialOwnerId } from './owner';

// Strings only: neither Number nor the bank ledger's four-decimal normalizer is used.
const decimal = z
  .string()
  .max(2048)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const key = z.string().min(1).max(256);
const currency = z.string().min(1).max(16);
const lineSchema = z.object({
  rowIdentity: key,
  rowNumber: z.number().int().positive(),
  sourceRowHash: hash,
  amount: decimal,
  currency,
  fxRate: decimal.nullable().default(null),
  fxCurrency: currency.nullable().default(null),
  fxAsOf: z.iso.date().nullable().default(null),
});
const importSchema = z.object({
  connectorAccountId: z.uuid(),
  importKey: key,
  statementKey: key,
  version: z.number().int().positive(),
  parserVersion: key,
  expiresAt: z.date().refine(value => value.getTime() > Date.now()),
  lines: z.array(lineSchema).min(1).max(10_000),
});
export type RoyaltyImport = z.input<typeof importSchema> & {
  readonly evidence: Uint8Array;
};

/** Pin identity and lock the active owner against a concurrent account erasure. */
async function withOwner<T>(
  owner: string,
  operation: Parameters<typeof withDbSessionTx<T>>[0]
): Promise<T> {
  return withDbSessionTx(
    async tx => {
      if (!(await lockActiveRoyaltyOwner(tx)))
        throw new Error('Financial owner unavailable');
      return operation(tx, owner);
    },
    { clerkUserId: owner }
  );
}

/**
 * Atomic import: evidence, version, lines and trigger-written canonical audit all
 * commit together. Duplicate import/version keys fail rather than overwrite history.
 * Encryption completes before opening the database transaction.
 */
export async function persistRoyaltyStatement(input: RoyaltyImport) {
  const owner = await requireFinancialOwnerId();
  const parsed = importSchema.parse(input);
  if (
    !(
      Buffer.isBuffer(input.evidence) || input.evidence instanceof Uint8Array
    ) ||
    input.evidence.byteLength === 0 ||
    input.evidence.byteLength > 10 * 1024 * 1024
  ) {
    throw new TypeError('Royalty evidence must contain 1 byte to 10 MiB');
  }
  if (!isPIIEncryptionEnabled())
    throw new Error('Royalty evidence encryption unavailable');
  const evidence = Buffer.from(input.evidence);
  const sourceHash = createHash('sha256').update(evidence).digest('hex');
  // Bind the encrypted bytes to their owner and digest, preventing ciphertext swaps.
  const encryptedEvidence = encryptPII(
    JSON.stringify({ owner, sourceHash, bytes: evidence.toString('base64') })
  );
  if (!encryptedEvidence) throw new Error('Royalty evidence encryption failed');

  return withOwner(owner, async tx => {
    const [source] = await tx
      .insert(royaltySources)
      .values({
        ownerUserId: owner,
        connectorAccountId: parsed.connectorAccountId,
        importKey: parsed.importKey,
        sourceHash,
        encryptedEvidence,
        expiresAt: parsed.expiresAt,
      })
      .returning({ id: royaltySources.id });
    if (!source) throw new Error('Royalty source persistence failed');
    const [version] = await tx
      .insert(royaltyStatementVersions)
      .values({
        ownerUserId: owner,
        sourceId: source.id,
        statementKey: parsed.statementKey,
        version: parsed.version,
        parserVersion: parsed.parserVersion,
      })
      .returning({ id: royaltyStatementVersions.id });
    if (!version) throw new Error('Royalty version persistence failed');
    let lineCount = 0;
    // Bound bind parameters below PostgreSQL's protocol limit; every batch is
    // inside this same owner transaction, so a later failure rolls all back.
    for (let offset = 0; offset < parsed.lines.length; offset += 1000) {
      const batch = parsed.lines.slice(offset, offset + 1000);
      const saved = await tx
        .insert(royaltyStatementLines)
        .values(
          batch.map(line => ({
            ...line,
            ownerUserId: owner,
            statementVersionId: version.id,
          }))
        )
        .returning({ id: royaltyStatementLines.id });
      if (saved.length !== batch.length)
        throw new Error('Royalty line persistence failed');
      lineCount += saved.length;
    }
    return {
      sourceId: source.id,
      statementVersionId: version.id,
      sourceHash,
      lineCount,
    };
  });
}

export async function listRoyaltyStatementVersions(statementKey: string) {
  const owner = await requireFinancialOwnerId();
  return withOwner(owner, tx =>
    tx
      .select(getTableColumns(royaltyStatementVersions))
      .from(royaltyStatementVersions)
      .innerJoin(
        royaltySources,
        eq(royaltySources.id, royaltyStatementVersions.sourceId)
      )
      .where(
        and(
          eq(royaltyStatementVersions.ownerUserId, owner),
          gt(royaltySources.expiresAt, new Date()),
          eq(royaltyStatementVersions.statementKey, key.parse(statementKey))
        )
      )
      .orderBy(asc(royaltyStatementVersions.version))
  );
}

export async function listRoyaltyStatementLines(statementVersionId: string) {
  const owner = await requireFinancialOwnerId();
  return withOwner(owner, tx =>
    tx
      .select(getTableColumns(royaltyStatementLines))
      .from(royaltyStatementLines)
      .innerJoin(
        royaltyStatementVersions,
        eq(
          royaltyStatementVersions.id,
          royaltyStatementLines.statementVersionId
        )
      )
      .innerJoin(
        royaltySources,
        eq(royaltySources.id, royaltyStatementVersions.sourceId)
      )
      .where(
        and(
          eq(royaltyStatementLines.ownerUserId, owner),
          gt(royaltySources.expiresAt, new Date()),
          eq(
            royaltyStatementLines.statementVersionId,
            z.uuid().parse(statementVersionId)
          )
        )
      )
      .orderBy(asc(royaltyStatementLines.rowNumber))
  );
}

export async function readRoyaltySourceEvidence(
  sourceId: string
): Promise<Uint8Array | null> {
  const owner = await requireFinancialOwnerId();
  const source = await withOwner(owner, async tx => {
    const [row] = await tx
      .select()
      .from(royaltySources)
      .where(
        and(
          eq(royaltySources.ownerUserId, owner),
          eq(royaltySources.id, z.uuid().parse(sourceId))
        )
      )
      .limit(1);
    return row;
  });
  if (!source || source.expiresAt <= new Date()) return null;
  if (!isPIIEncryptionEnabled())
    throw new Error('Royalty evidence encryption unavailable');
  if (
    !/^[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/.test(
      source.encryptedEvidence
    )
  ) {
    throw new Error('Royalty evidence integrity failure');
  }
  const plaintext = decryptPII(source.encryptedEvidence);
  const envelope = z
    .object({ owner: z.uuid(), sourceHash: hash, bytes: z.string() })
    .parse(JSON.parse(plaintext ?? 'null'));
  const bytes = Buffer.from(envelope.bytes, 'base64');
  if (
    envelope.owner !== owner ||
    envelope.sourceHash !== source.sourceHash ||
    createHash('sha256').update(bytes).digest('hex') !== source.sourceHash
  ) {
    throw new Error('Royalty evidence integrity failure');
  }
  return bytes;
}

/** Owner retention is explicit; deleting a source atomically removes its versions and lines. */
export async function deleteRoyaltySource(sourceId: string): Promise<boolean> {
  const owner = await requireFinancialOwnerId();
  return withOwner(owner, async tx => {
    const rows = await tx
      .delete(royaltySources)
      .where(
        and(
          eq(royaltySources.ownerUserId, owner),
          eq(royaltySources.id, z.uuid().parse(sourceId))
        )
      )
      .returning({ id: royaltySources.id });
    return rows.length === 1;
  });
}

/** Bounded, authenticated sweep; no cross-owner or system RLS bypass. */
export async function purgeExpiredRoyaltySources(): Promise<number> {
  const owner = await requireFinancialOwnerId();
  return withOwner(owner, async tx => {
    const expired = await tx
      .select({ id: royaltySources.id })
      .from(royaltySources)
      .where(
        and(
          eq(royaltySources.ownerUserId, owner),
          lte(royaltySources.expiresAt, new Date())
        )
      )
      .limit(100);
    if (expired.length === 0) return 0;
    const deleted = await tx
      .delete(royaltySources)
      .where(
        and(
          eq(royaltySources.ownerUserId, owner),
          inArray(
            royaltySources.id,
            expired.map(source => source.id)
          )
        )
      )
      .returning({ id: royaltySources.id });
    return deleted.length;
  });
}
