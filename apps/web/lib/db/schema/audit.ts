import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

/**
 * Ingest audit log table for tracking Spotify ingest operations.
 *
 * Stores structured audit events for search, claim, data refresh,
 * and OAuth operations. Used for compliance, security analysis,
 * and debugging.
 */
export const ingestAuditLogs = pgTable(
  'ingest_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    level: text('level').notNull().default('info'),
    userId: uuid('user_id'),
    artistId: uuid('artist_id'),
    spotifyId: text('spotify_id'),
    handle: text('handle'),
    action: text('action'),
    result: text('result'),
    failureReason: text('failure_reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    typeIdx: index('idx_ingest_audit_logs_type').on(table.type),
    userIdIdx: index('idx_ingest_audit_logs_user_id').on(table.userId),
    createdAtIdx: index('idx_ingest_audit_logs_created_at').on(table.createdAt),
    resultIdx: index('idx_ingest_audit_logs_result').on(table.result),
  })
);

// Schema validations
export const insertIngestAuditLogSchema = createInsertSchema(ingestAuditLogs);
export const selectIngestAuditLogSchema = createSelectSchema(ingestAuditLogs);

// Types
export type IngestAuditLog = typeof ingestAuditLogs.$inferSelect;
export type NewIngestAuditLog = typeof ingestAuditLogs.$inferInsert;
