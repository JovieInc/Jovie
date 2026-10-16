import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { connectorAccounts } from './connectors';

/** Private financial evidence; creator access never grants access to these rows. */
export const royaltySources = pgTable(
  'royalty_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectorAccountId: uuid('connector_account_id').notNull(),
    importKey: text('import_key').notNull(),
    sourceHash: text('source_hash').notNull(),
    /** Base64 original bytes inside an authenticated encrypted envelope. Never a public URL. */
    encryptedEvidence: text('encrypted_evidence').notNull(),
    status: text('status').notNull().default('persisted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('royalty_sources_owner_id_unique').on(t.ownerUserId, t.id),
    uniqueIndex('royalty_sources_import_unique').on(
      t.ownerUserId,
      t.connectorAccountId,
      t.importKey
    ),
    index('royalty_sources_hash_idx').on(t.ownerUserId, t.sourceHash),
    index('royalty_sources_retention_idx').on(t.ownerUserId, t.expiresAt),
    foreignKey({
      name: 'royalty_sources_connector_owner_fk',
      columns: [t.ownerUserId, t.connectorAccountId],
      foreignColumns: [connectorAccounts.userId, connectorAccounts.id],
    }).onDelete('cascade'),
    check(
      'royalty_sources_hash_check',
      drizzleSql`${t.sourceHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      'royalty_sources_status_check',
      drizzleSql`${t.status} = 'persisted'`
    ),
    check(
      'royalty_sources_expiry_check',
      drizzleSql`${t.expiresAt} > ${t.createdAt}`
    ),
  ]
).enableRLS();

/** Corrections append a new version; existing source/version/line rows cannot be updated. */
export const royaltyStatementVersions = pgTable(
  'royalty_statement_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    statementKey: text('statement_key').notNull(),
    version: integer('version').notNull(),
    parserVersion: text('parser_version').notNull(),
    status: text('status').notNull().default('persisted'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('royalty_versions_owner_id_unique').on(t.ownerUserId, t.id),
    uniqueIndex('royalty_versions_identity_unique').on(
      t.ownerUserId,
      t.statementKey,
      t.version
    ),
    index('royalty_versions_source_idx').on(t.ownerUserId, t.sourceId),
    foreignKey({
      name: 'royalty_versions_source_owner_fk',
      columns: [t.ownerUserId, t.sourceId],
      foreignColumns: [royaltySources.ownerUserId, royaltySources.id],
    }).onDelete('cascade'),
    check('royalty_versions_version_check', drizzleSql`${t.version} > 0`),
    check(
      'royalty_versions_status_check',
      drizzleSql`${t.status} = 'persisted'`
    ),
  ]
).enableRLS();

export const royaltyStatementLines = pgTable(
  'royalty_statement_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    statementVersionId: uuid('statement_version_id').notNull(),
    rowIdentity: text('row_identity').notNull(),
    rowNumber: integer('row_number').notNull(),
    sourceRowHash: text('source_row_hash').notNull(),
    /** Unconstrained NUMERIC stays a decimal string, including the supplied scale. */
    amount: numeric('amount').notNull(),
    currency: text('currency').notNull(),
    fxRate: numeric('fx_rate'),
    fxCurrency: text('fx_currency'),
    fxAsOf: text('fx_as_of'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('royalty_lines_identity_unique').on(
      t.ownerUserId,
      t.statementVersionId,
      t.rowIdentity
    ),
    uniqueIndex('royalty_lines_position_unique').on(
      t.ownerUserId,
      t.statementVersionId,
      t.rowNumber
    ),
    foreignKey({
      name: 'royalty_lines_version_owner_fk',
      columns: [t.ownerUserId, t.statementVersionId],
      foreignColumns: [
        royaltyStatementVersions.ownerUserId,
        royaltyStatementVersions.id,
      ],
    }).onDelete('cascade'),
    check('royalty_lines_row_check', drizzleSql`${t.rowNumber} > 0`),
    check(
      'royalty_lines_hash_check',
      drizzleSql`${t.sourceRowHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      'royalty_lines_amount_check',
      drizzleSql`${t.amount}::text NOT IN ('NaN', 'Infinity', '-Infinity')`
    ),
    check(
      'royalty_lines_fx_check',
      drizzleSql`${t.fxRate} IS NULL OR (${t.fxRate} > 0 AND ${t.fxRate}::text NOT IN ('NaN', 'Infinity'))`
    ),
  ]
).enableRLS();
