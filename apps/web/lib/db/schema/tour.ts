import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { creatorProfiles } from './profiles';

// Enums for tour dates
export const tourDateProviderEnum = pgEnum('tour_date_provider', [
  'bandsintown',
  'songkick',
  'manual',
]);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'available',
  'sold_out',
  'cancelled',
]);

/**
 * Tour dates table for storing concert/show information.
 * Supports one-way sync from Bandsintown with manual override capability.
 */
export const tourDates = pgTable(
  'tour_dates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    // External sync identifiers
    externalId: text('external_id'), // Bandsintown event ID
    provider: tourDateProviderEnum('provider').default('manual').notNull(),

    // Event details
    title: text('title'), // Optional custom title override
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    startTime: text('start_time'), // Display time e.g. "7:00 PM"

    // Venue information
    venueName: text('venue_name').notNull(),
    city: text('city').notNull(),
    region: text('region'), // State/Province
    country: text('country').notNull(),
    latitude: real('latitude'),
    longitude: real('longitude'),

    // Ticket information
    ticketUrl: text('ticket_url'),
    ticketStatus: ticketStatusEnum('ticket_status')
      .default('available')
      .notNull(),

    // Sync metadata
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    rawData: jsonb('raw_data').$type<Record<string, unknown>>(), // Full provider response

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    // Index for fetching tour dates by profile
    profileIdIdx: index('idx_tour_dates_profile_id').on(table.profileId),
    // Index for sorting by date
    startDateIdx: index('idx_tour_dates_start_date').on(table.startDate),
    // Unique constraint to prevent duplicate external events
    externalIdProviderUnique: uniqueIndex(
      'idx_tour_dates_external_id_provider'
    ).on(table.profileId, table.externalId, table.provider),
  })
);

// Schema validations
export const insertTourDateSchema = createInsertSchema(tourDates);
export const selectTourDateSchema = createSelectSchema(tourDates);

// Types
export type TourDate = typeof tourDates.$inferSelect;
export type NewTourDate = typeof tourDates.$inferInsert;
