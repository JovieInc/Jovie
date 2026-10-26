import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { creatorProfiles } from './profiles';

/**
 * Daily counters for the profile featured slot (one-right-thing engine).
 *
 * One row per profile, day, item kind, reason code and arrival channel. It
 * holds counts only: no visitor id, session id, user agent or IP, so it is
 * safe to keep whatever the visitor's consent state. Values are validated
 * against the engine allow-lists before insert.
 */
export const featuredSlotDaily = pgTable(
  'featured_slot_daily',
  {
    day: date('day').notNull(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    channel: text('channel').notNull(),
    impressions: integer('impressions').notNull().default(0),
    taps: integer('taps').notNull().default(0),
  },
  table => [
    primaryKey({
      columns: [
        table.day,
        table.creatorProfileId,
        table.kind,
        table.reason,
        table.channel,
      ],
    }),
    index('featured_slot_daily_day_idx').on(table.day),
  ]
);
