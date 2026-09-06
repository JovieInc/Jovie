import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const releaseMergeEvents = pgTable('release_merge_events', {
  id: uuid('id').defaultRandom().primaryKey(), eventKey: text('event_key').notNull(), repository: text('repository').notNull(), pullRequestNumber: integer('pull_request_number').notNull(), mergeSha: text('merge_sha').notNull(), mergedAt: timestamp('merged_at', { withTimezone: true }).notNull(), product: text('product').notNull(), app: text('app').notNull(), payload: jsonb('payload').$type<Record<string, unknown>>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ eventKeyUnique: uniqueIndex('release_merge_events_event_key_unique').on(table.eventKey) }));
export const releaseDailyPosts = pgTable('release_daily_posts', {
  id: uuid('id').defaultRandom().primaryKey(), product: text('product').notNull(), app: text('app').notNull(), localDate: text('local_date').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ identityUnique: uniqueIndex('release_daily_posts_identity_unique').on(table.product, table.app, table.localDate) }));
export const releaseDailyPostEntries = pgTable('release_daily_post_entries', {
  id: uuid('id').defaultRandom().primaryKey(), postId: uuid('post_id').notNull().references(() => releaseDailyPosts.id, { onDelete: 'cascade' }), eventId: uuid('event_id').notNull().references(() => releaseMergeEvents.id, { onDelete: 'restrict' }), repository: text('repository').notNull(), app: text('app').notNull(), pullRequestNumber: integer('pull_request_number').notNull(), mergeSha: text('merge_sha').notNull(), title: text('title').notNull(), body: text('body'), url: text('url'), material: boolean('material').notNull(), audienceEligible: boolean('audience_eligible').notNull(), payload: jsonb('payload').$type<Record<string, unknown>>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ postIdx: index('release_daily_post_entries_post_idx').on(table.postId) }));
export const releaseDailyPostDismissals = pgTable('release_daily_post_dismissals', {
  id: uuid('id').defaultRandom().primaryKey(), postId: uuid('post_id').notNull().references(() => releaseDailyPosts.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull(), dismissedAt: timestamp('dismissed_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ userPostUnique: uniqueIndex('release_daily_post_dismissals_user_post_unique').on(table.postId, table.userId) }));
export type ReleaseMergeEvent = typeof releaseMergeEvents.$inferSelect;
export type ReleaseDailyPost = typeof releaseDailyPosts.$inferSelect;
export type ReleaseDailyPostEntry = typeof releaseDailyPostEntries.$inferSelect;
export type ReleaseDailyPostDismissal = typeof releaseDailyPostDismissals.$inferSelect;
