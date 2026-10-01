import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Personal finance tables (JOV-4609).
 *
 * Every row is keyed by `owner_user_id` → `users.id`. There is deliberately
 * NO creator_id / workspace / collaborator column anywhere in this module:
 * creator-profile access must never imply financial access, and v1 supports
 * no sharing. RLS policies (see the finance migration) grant access only to
 * `owner_user_id = current_app_user_uuid()` — deny-by-default with no system
 * or owner-bridge bypass.
 */

/** A linked financial institution (e.g. a Plaid item) owned by one user. */
export const financeInstitutions = pgTable(
  'finance_institutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerItemId: text('provider_item_id').notNull(),
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_institutions_owner_idx').on(table.ownerUserId),
    providerItemIdx: index('finance_institutions_provider_item_idx').on(
      table.provider,
      table.providerItemId
    ),
  })
);

/** A financial account (checking, savings, credit) under one institution. */
export const financeAccounts = pgTable(
  'finance_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(
      () => financeInstitutions.id,
      { onDelete: 'cascade' }
    ),
    providerAccountId: text('provider_account_id'),
    /** True when the provider last reported this account as removed/closed. */
    removedAt: timestamp('removed_at', { withTimezone: true }),
    name: text('name').notNull(),
    accountType: text('account_type'),
    currency: text('currency').notNull().default('USD'),
    currentBalance: numeric('current_balance', {
      precision: 19,
      scale: 4,
    }),
    availableBalance: numeric('available_balance', {
      precision: 19,
      scale: 4,
    }),
    balanceUpdatedAt: timestamp('balance_updated_at', { withTimezone: true }),
    /**
     * Account-level default lens applied when no rule or deterministic
     * pattern matches. One of FINANCE_LENSES or null (no default).
     * Classification only — never a sharing signal (JOV-4615).
     */
    defaultLens: text('default_lens'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_accounts_owner_idx').on(table.ownerUserId),
    institutionIdx: index('finance_accounts_institution_idx').on(
      table.institutionId
    ),
    /** One canonical row per provider account inside an institution. */
    providerAccountUnique: uniqueIndex(
      'finance_accounts_provider_account_unique'
    ).on(table.ownerUserId, table.institutionId, table.providerAccountId),
  })
);

/**
 * A canonical transaction line on a finance account (JOV-4612).
 *
 * `amount` is stored in bank convention: positive = inflow to the account,
 * negative = outflow. `dedupeKey` is a stable hash of the owner, account,
 * provider transaction id (or a content fingerprint when the provider omits
 * an id) so re-running any sync range upserts into the same row.
 *
 * `status`: pending | posted | removed | superseded.
 *   - superseded: a pending row replaced by a posted provider record; it is
 *     excluded from ledger totals via `supersededById`.
 * `flowKind`: unclassified | spend | income | transfer | cc_payment |
 *   refund | reversal | duplicate. transfer/cc_payment/duplicate rows are
 *   excluded from income and burn metrics.
 */
export const financeTransactions = pgTable(
  'finance_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financeAccounts.id, { onDelete: 'cascade' }),
    providerTransactionId: text('provider_transaction_id'),
    dedupeKey: text('dedupe_key'),
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    merchantName: text('merchant_name'),
    description: text('description'),
    category: text('category'),
    pending: text('pending').notNull().default('false'),
    status: text('status').notNull().default('posted'),
    flowKind: text('flow_kind').notNull().default('unclassified'),
    /** Paired counterpart for transfers, payments, refunds, duplicates. */
    matchedTransactionId: uuid('matched_transaction_id').references(
      (): AnyPgColumn => financeTransactions.id,
      { onDelete: 'set null' }
    ),
    /** The posted row that replaced this pending row, if any. */
    supersededById: uuid('superseded_by_id').references(
      (): AnyPgColumn => financeTransactions.id,
      { onDelete: 'set null' }
    ),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_transactions_owner_idx').on(table.ownerUserId),
    accountIdx: index('finance_transactions_account_idx').on(table.accountId),
    occurredIdx: index('finance_transactions_occurred_idx').on(
      table.ownerUserId,
      table.occurredAt
    ),
    dedupeUnique: uniqueIndex('finance_transactions_dedupe_unique').on(
      table.ownerUserId,
      table.accountId,
      table.dedupeKey
    ),
  })
);

/**
 * Cursor + health state for incremental sync per linked institution.
 * `cursor` is the provider's opaque continuation token; `status` drives
 * retry and dead-letter behaviour for sync jobs.
 */
export const financeSyncStates = pgTable(
  'finance_sync_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => financeInstitutions.id, { onDelete: 'cascade' }),
    cursor: text('cursor'),
    status: text('status').notNull().default('idle'),
    failureCount: integer('failure_count').notNull().default(0),
    /** Error class only (e.g. 'provider_error'); never a payload/message. */
    lastErrorCode: text('last_error_code'),
    lastRequestId: text('last_request_id'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_sync_states_owner_idx').on(table.ownerUserId),
    institutionUnique: uniqueIndex('finance_sync_states_institution_unique').on(
      table.ownerUserId,
      table.institutionId
    ),
  })
);

/**
 * Daily per-account balance snapshots for historical charts and drift
 * detection. `source` distinguishes provider-reported balances from
 * ledger-derived expected balances so reconciliation can compare them.
 */
export const financeBalanceSnapshots = pgTable(
  'finance_balance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financeAccounts.id, { onDelete: 'cascade' }),
    snapshotDate: text('snapshot_date').notNull(),
    source: text('source').notNull(),
    balance: numeric('balance', { precision: 19, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_balance_snapshots_owner_idx').on(
      table.ownerUserId
    ),
    accountDateUnique: uniqueIndex(
      'finance_balance_snapshots_account_date_unique'
    ).on(table.accountId, table.snapshotDate, table.source),
  })
);

/**
 * Append-only audit trail of canonical ledger changes: upserts, removals,
 * pending→posted reconciliation, classification, and balance corrections.
 * `payload` carries canonical domain fields only — never raw provider
 * payloads — and every row is owner-scoped like the rest of the module.
 */
export const financeLedgerEvents = pgTable(
  'finance_ledger_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityId: text('entity_id').notNull(),
    eventKind: text('event_kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    syncRequestId: text('sync_request_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_ledger_events_owner_idx').on(table.ownerUserId),
    entityIdx: index('finance_ledger_events_entity_idx').on(
      table.entityKind,
      table.entityId
    ),
  })
);

/** Owner-visible anomalies (balance drift, unresolved reconciliation). */
export const financeAnomalies = pgTable(
  'finance_anomalies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => financeAccounts.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('open'),
    /** Redacted-safe detail: counts, tolerance, drift — no raw payloads. */
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  table => ({
    ownerIdx: index('finance_anomalies_owner_idx').on(table.ownerUserId),
    accountIdx: index('finance_anomalies_account_idx').on(table.accountId),
  })
);

/** Owner-generated exports (CSV/PDF). Payload refs only; no row data here. */
export const financeExports = pgTable(
  'finance_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    fileRef: text('file_ref'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  table => ({
    ownerIdx: index('finance_exports_owner_idx').on(table.ownerUserId),
  })
);
/**
 * Budget targets (JOV-4620).
 *
 * One row per (owner, category, month). `month` is the literal string
 * `'YYYY-MM'` for a month-specific override or the sentinel `'baseline'`
 * for the recurring default. Override resolution is deterministic:
 * a row whose `month` equals the requested month wins; otherwise the
 * `'baseline'` row applies. History is stable because overrides are rows,
 * not mutations of the baseline.
 */
export const financeBudgetTargets = pgTable(
  'finance_budget_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    month: text('month').notNull().default('baseline'),
    targetAmount: numeric('target_amount', {
      precision: 19,
      scale: 4,
    }).notNull(),
    currency: text('currency').notNull().default('USD'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_budget_targets_owner_idx').on(table.ownerUserId),
    ownerCategoryMonthIdx: uniqueIndex(
      'finance_budget_targets_owner_category_month_idx'
    ).on(table.ownerUserId, table.category, table.month),
  })
);

/**
 * Per-owner budget inclusion settings (JOV-4620).
 *
 * `included_account_ids` limits which finance accounts feed budget actuals;
 * NULL means all of the owner's accounts are included — the same default the
 * ledger queries use.
 */
export const financeBudgetSettings = pgTable('finance_budget_settings', {
  ownerUserId: uuid('owner_user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  includedAccountIds: jsonb('included_account_ids').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Owner-authored classification rules (JOV-4615).
 *
 * Rules are derived from owner corrections (or created manually) and match on
 * safe fields only: account, normalized merchant pattern, direction, amount
 * range, recurrence, and description tokens. `provenance` records where the
 * rule came from so every classification can show which rule produced it.
 */
export const financeClassificationRules = pgTable(
  'finance_classification_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    priority: integer('priority').notNull().default(100),
    matchAccountId: uuid('match_account_id').references(
      () => financeAccounts.id,
      { onDelete: 'cascade' }
    ),
    matchMerchantPattern: text('match_merchant_pattern'),
    matchDirection: text('match_direction'),
    matchAmountMin: numeric('match_amount_min', {
      precision: 19,
      scale: 4,
    }),
    matchAmountMax: numeric('match_amount_max', {
      precision: 19,
      scale: 4,
    }),
    matchDescriptionTokens: jsonb('match_description_tokens').$type<string[]>(),
    matchRecurrence: text('match_recurrence'),
    setLens: text('set_lens').notNull(),
    setCategory: text('set_category'),
    provenance: text('provenance').notNull().default('manual'),
    sourceTransactionId: uuid('source_transaction_id').references(
      () => financeTransactions.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    ownerIdx: index('finance_classification_rules_owner_idx').on(
      table.ownerUserId
    ),
  })
);

/**
 * The stored classification for one transaction (JOV-4615).
 *
 * One row per transaction; reprocessing upserts by `transaction_id` so
 * re-runs are idempotent. `source`/`ruleId`/`explanation` give the owner
 * provenance: which rule, deterministic pattern, or (audited) model decision
 * produced the result.
 */
export const financeTransactionClassifications = pgTable(
  'finance_transaction_classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => financeTransactions.id, { onDelete: 'cascade' }),
    lens: text('lens').notNull(),
    category: text('category'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
    explanation: text('explanation').notNull(),
    source: text('source').notNull(),
    ruleId: uuid('rule_id').references(() => financeClassificationRules.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    transactionIdx: uniqueIndex(
      'finance_transaction_classifications_tx_idx'
    ).on(table.transactionId),
    ownerIdx: index('finance_transaction_classifications_owner_idx').on(
      table.ownerUserId
    ),
  })
);

/**
 * Split lines for transactions spanning personal and creator purposes
 * (JOV-4615). Split amounts must sum exactly to the parent transaction's
 * amount; enforced in the repository layer.
 */
export const financeTransactionSplits = pgTable(
  'finance_transaction_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => financeTransactions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
    lens: text('lens').notNull(),
    category: text('category'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    transactionIdx: index('finance_transaction_splits_tx_idx').on(
      table.transactionId
    ),
    ownerIdx: index('finance_transaction_splits_owner_idx').on(
      table.ownerUserId
    ),
  })
);

export type FinanceInstitution = typeof financeInstitutions.$inferSelect;
export type NewFinanceInstitution = typeof financeInstitutions.$inferInsert;
export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type NewFinanceAccount = typeof financeAccounts.$inferInsert;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type NewFinanceTransaction = typeof financeTransactions.$inferInsert;
export type FinanceSyncState = typeof financeSyncStates.$inferSelect;
export type NewFinanceSyncState = typeof financeSyncStates.$inferInsert;
export type FinanceBalanceSnapshot =
  typeof financeBalanceSnapshots.$inferSelect;
export type NewFinanceBalanceSnapshot =
  typeof financeBalanceSnapshots.$inferInsert;
export type FinanceLedgerEvent = typeof financeLedgerEvents.$inferSelect;
export type NewFinanceLedgerEvent = typeof financeLedgerEvents.$inferInsert;
export type FinanceAnomaly = typeof financeAnomalies.$inferSelect;
export type NewFinanceAnomaly = typeof financeAnomalies.$inferInsert;
export type FinanceExport = typeof financeExports.$inferSelect;
export type NewFinanceExport = typeof financeExports.$inferInsert;
export type FinanceBudgetTarget = typeof financeBudgetTargets.$inferSelect;
export type NewFinanceBudgetTarget = typeof financeBudgetTargets.$inferInsert;
export type FinanceBudgetSettings = typeof financeBudgetSettings.$inferSelect;
export type NewFinanceBudgetSettings =
  typeof financeBudgetSettings.$inferInsert;
export type FinanceClassificationRule =
  typeof financeClassificationRules.$inferSelect;
export type NewFinanceClassificationRule =
  typeof financeClassificationRules.$inferInsert;
export type FinanceTransactionClassification =
  typeof financeTransactionClassifications.$inferSelect;
export type NewFinanceTransactionClassification =
  typeof financeTransactionClassifications.$inferInsert;
export type FinanceTransactionSplit =
  typeof financeTransactionSplits.$inferSelect;
export type NewFinanceTransactionSplit =
  typeof financeTransactionSplits.$inferInsert;
