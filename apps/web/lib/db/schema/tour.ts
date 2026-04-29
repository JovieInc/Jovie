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
  'admin_import',
]);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'available',
  'sold_out',
  'cancelled',
]);

// Broader event types that can sit on the unified calendar alongside releases.
// Today the table is called `tour_dates` for backwards compatibility; the
// concept is "events" and the row may be a tour, livestream, listening party,
// AMA, or signing.
export const eventTypeEnum = pgEnum('event_type', [
  'tour',
  'livestream',
  'listening_party',
  'ama',
  'signing',
]);

// Trust gate for synced events. Provider-imported rows land as `pending`
// and stay invisible to fans + suppressed from notifications until the
// creator confirms or rejects.
export const confirmationStatusEnum = pgEnum('confirmation_status', [
  'pending',
  'confirmed',
  'rejected',
]);

/**
 * Tour dates table for storing concert/show information.
 * Supports one-way sync from Bandsintown with manual override capability.
 *
 * Despite the table name, this powers the unified events concept:
 * `eventType` widens it beyond tour stops, and `confirmationStatus`
 * gates synced rows from reaching fan-facing surfaces.
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

    // Event categorization. Defaults to 'tour' so historical rows stay
    // semantically tour stops; new event types are explicit.
    eventType: eventTypeEnum('event_type').default('tour').notNull(),

    // Trust gate. The application layer derives this from `provider` —
    // never insert without setting it explicitly via the insertEvent helper.
    confirmationStatus: confirmationStatusEnum('confirmation_status').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

    // Event details
    title: text('title'), // Optional custom title override
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    startTime: text('start_time'), // Display time e.g. "7:00 PM"
    timezone: text('timezone'), // IANA timezone e.g. "America/New_York"

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
    // Hot path for the trust queue: "pending events for this profile"
    confirmationStatusIdx: index('idx_tour_dates_confirmation_status').on(
      table.profileId,
      table.confirmationStatus
    ),
  })
);

// Schema validations
export const insertTourDateSchema = createInsertSchema(tourDates);
export const selectTourDateSchema = createSelectSchema(tourDates);

// Types
export type TourDate = typeof tourDates.$inferSelect;
export type NewTourDate = typeof tourDates.$inferInsert;
export type TourDateProvider = (typeof tourDateProviderEnum.enumValues)[number];
export type EventType = (typeof eventTypeEnum.enumValues)[number];
export type ConfirmationStatus =
  (typeof confirmationStatusEnum.enumValues)[number];
