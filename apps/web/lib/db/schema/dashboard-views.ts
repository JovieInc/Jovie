import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Agent- or user-published dashboard views: a `jovie.view.v1` JSON spec plus an
 * opaque share token. Public read by token (like library asset shares), so no
 * per-user RLS; writes go through the publish service with an owner actor.
 */
export const dashboardViews = pgTable(
  'dashboard_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    spec: jsonb('spec').notNull(),
    version: integer('version').notNull().default(1),
    /** Opaque token for public /v/{shareToken} URLs */
    shareToken: text('share_token').notNull(),
    /** 'agent' | 'user' */
    source: text('source').notNull(),
    /** Agent name or 'user' */
    createdBy: text('created_by').notNull(),
    forkedFromViewId: uuid('forked_from_view_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    shareTokenUnique: uniqueIndex('dashboard_views_share_token_unique').on(
      table.shareToken
    ),
    ownerIdx: index('dashboard_views_owner_user_id_idx').on(table.ownerUserId),
  })
);

export const dashboardViewVersions = pgTable(
  'dashboard_view_versions',
  {
    viewId: uuid('view_id')
      .notNull()
      .references(() => dashboardViews.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    spec: jsonb('spec').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.viewId, table.version] }),
  })
);

export type DashboardViewRow = typeof dashboardViews.$inferSelect;
export type NewDashboardViewRow = typeof dashboardViews.$inferInsert;
export type DashboardViewVersionRow = typeof dashboardViewVersions.$inferSelect;
