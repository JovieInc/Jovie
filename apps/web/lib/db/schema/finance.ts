import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
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
  })
);

/** A single transaction line on a finance account. */
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
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    merchantName: text('merchant_name'),
    description: text('description'),
    category: text('category'),
    pending: text('pending').notNull().default('false'),
    createdAt: timestamp('created_at', { withTimezone: true })
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

export type FinanceInstitution = typeof financeInstitutions.$inferSelect;
export type NewFinanceInstitution = typeof financeInstitutions.$inferInsert;
export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type NewFinanceAccount = typeof financeAccounts.$inferInsert;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type NewFinanceTransaction = typeof financeTransactions.$inferInsert;
export type FinanceExport = typeof financeExports.$inferSelect;
export type NewFinanceExport = typeof financeExports.$inferInsert;
