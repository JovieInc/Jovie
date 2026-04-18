import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';

// Admin audit log for tracking all admin actions (auth hardening)
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    adminUserIdIdx: index('idx_admin_audit_log_admin_user_id').on(
      table.adminUserId
    ),
    targetUserIdIdx: index('idx_admin_audit_log_target_user_id').on(
      table.targetUserId
    ),
    createdAtIdx: index('idx_admin_audit_log_created_at').on(table.createdAt),
    actionIdx: index('idx_admin_audit_log_action').on(table.action),
  })
);

// Campaign settings (singleton row, id=1)
export const campaignSettings = pgTable('campaign_settings', {
  id: integer('id').primaryKey().default(1),
  campaignsEnabled: boolean('campaigns_enabled').default(true).notNull(),
  fitScoreThreshold: numeric('fit_score_threshold', {
    precision: 5,
    scale: 2,
  })
    .default('50')
    .notNull(),
  batchLimit: integer('batch_limit').default(20).notNull(),
  throttlingConfig: jsonb('throttling_config')
    .$type<{
      minDelayMs: number;
      maxDelayMs: number;
      maxPerHour: number;
    }>()
    .default({ minDelayMs: 30000, maxDelayMs: 120000, maxPerHour: 30 })
    .notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
});

// Admin system settings (singleton row, id=1)
export const adminSystemSettings = pgTable('admin_system_settings', {
  id: integer('id').primaryKey().default(1),
  playlistSpotifyClerkUserId: text('playlist_spotify_clerk_user_id'),
  playlistSpotifyUpdatedAt: timestamp('playlist_spotify_updated_at'),
  playlistSpotifyUpdatedBy: uuid('playlist_spotify_updated_by').references(
    () => users.id,
    { onDelete: 'set null' }
  ),
  playlistEngineEnabled: boolean('playlist_engine_enabled')
    .default(false)
    .notNull(),
  playlistGenerationIntervalValue: integer('playlist_generation_interval_value')
    .default(3)
    .notNull(),
  playlistGenerationIntervalUnit: text('playlist_generation_interval_unit')
    .$type<'hours' | 'days' | 'weeks'>()
    .default('days')
    .notNull(),
  playlistLastGeneratedAt: timestamp('playlist_last_generated_at'),
  playlistNextEligibleAt: timestamp('playlist_next_eligible_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Schema validations
export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog);
export const selectAdminAuditLogSchema = createSelectSchema(adminAuditLog);

export const insertCampaignSettingsSchema =
  createInsertSchema(campaignSettings);
export const selectCampaignSettingsSchema =
  createSelectSchema(campaignSettings);
export const insertAdminSystemSettingsSchema =
  createInsertSchema(adminSystemSettings);
export const selectAdminSystemSettingsSchema =
  createSelectSchema(adminSystemSettings);

// Types
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLog.$inferInsert;

export type CampaignSettings = typeof campaignSettings.$inferSelect;
export type NewCampaignSettings = typeof campaignSettings.$inferInsert;
export type AdminSystemSettings = typeof adminSystemSettings.$inferSelect;
export type NewAdminSystemSettings = typeof adminSystemSettings.$inferInsert;
