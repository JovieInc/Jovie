import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AiCrawlerDailyPoint,
  AiCrawlerStat,
} from '@/types/ai-crawler-analytics';
import { creatorProfiles } from './profiles';

export const aiCrawlerAnalyticsSnapshots = pgTable(
  'ai_crawler_analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    periodDays: integer('period_days').notNull().default(30),
    totalRequests: integer('total_requests').notNull().default(0),
    weeklyRequests: integer('weekly_requests').notNull().default(0),
    crawlers: jsonb('crawlers').$type<AiCrawlerStat[]>().notNull().default([]),
    dailyTrend: jsonb('daily_trend')
      .$type<AiCrawlerDailyPoint[]>()
      .notNull()
      .default([]),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [
    uniqueIndex('ai_crawler_analytics_profile_period_unique').on(
      table.creatorProfileId,
      table.periodDays
    ),
    index('ai_crawler_analytics_synced_at_idx').on(table.syncedAt),
  ]
);
