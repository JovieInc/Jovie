import { sql as drizzleSql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';

export interface AcquisitionFirstTouch {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  landingPath?: string;
  claimId?: string;
  runId?: string;
  candidateId?: string;
  offerVersion?: string;
}

/** Consent-scoped, first-party acquisition identity. No IP or fingerprint data. */
export const acquisitionJourneys = pgTable(
  'acquisition_journeys',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    firstTouch: jsonb('first_touch')
      .$type<AcquisitionFirstTouch>()
      .default({})
      .notNull(),
    consentState: text('consent_state').notNull(),
    identityScope: text('identity_scope')
      .default('consented_first_party_browser')
      .notNull(),
    capturedAt: timestamp('captured_at').notNull(),
    linkedAt: timestamp('linked_at'),
    consentRevokedAt: timestamp('consent_revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userUnique: uniqueIndex('acquisition_journeys_user_id_unique')
      .on(table.userId)
      .where(drizzleSql`user_id IS NOT NULL`),
    capturedAtIdx: index('acquisition_journeys_captured_at_idx').on(
      table.capturedAt
    ),
  })
);

export const insertAcquisitionJourneySchema =
  createInsertSchema(acquisitionJourneys);
export const selectAcquisitionJourneySchema =
  createSelectSchema(acquisitionJourneys);
export type AcquisitionJourney = typeof acquisitionJourneys.$inferSelect;
export type NewAcquisitionJourney = typeof acquisitionJourneys.$inferInsert;
