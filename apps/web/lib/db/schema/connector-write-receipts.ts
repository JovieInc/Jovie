import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ProfileWriteReceipt } from '@/lib/connectors/profile-writes/contract';

/** No cascading FKs: disconnect/account deletion must not rewrite audit history. */
export const connectorWriteReceipts = pgTable(
  'connector_write_receipts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    proposalId: uuid('proposal_id').notNull(),
    connectorAccountId: uuid('connector_account_id').notNull(),
    phase: text('phase').notNull(),
    rateKey: text('rate_key'),
    receipt: jsonb('receipt').$type<ProfileWriteReceipt>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('connector_write_receipts_phase_uniq').on(
      table.proposalId,
      table.phase
    ),
    uniqueIndex('connector_write_receipts_rate_uniq').on(table.rateKey),
    index('connector_write_receipts_user_account_idx').on(
      table.userId,
      table.connectorAccountId,
      table.recordedAt
    ),
  ]
);
