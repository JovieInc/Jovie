import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { creatorProfiles } from './profiles';

/**
 * Profile inquiries — structured messages and intents captured by the public
 * "Ask Jovie" surface on a creator's profile.
 *
 * Two record shapes share this table:
 * - `kind = 'message'`: a visitor-directed message (fan mail, booking, press,
 *   collaboration, business, other) that Jovie could not answer from grounded
 *   public data, or that the visitor explicitly addressed to the owner.
 * - `kind = 'intent'`: an audience-capture record pairing a contact channel
 *   with a structured intent (e.g. `new_release_alerts`, `local_show_alerts`)
 *   rather than a generic subscriber record.
 * - `kind = 'question'`: a question Jovie could not answer from grounded
 *   data. Persisted so the owner sees demand signals ("what people ask
 *   about") even when the visitor declines to leave contact info.
 */
export const profileInquiries = pgTable(
  'profile_inquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    audienceMemberId: uuid('audience_member_id'),
    kind: text('kind', { enum: ['message', 'intent', 'question'] })
      .notNull()
      .default('message'),
    /**
     * Coarse routing category. For messages: fan_mail, booking, press,
     * collaboration, business, support, other. For intents: the intent id
     * (new_release_alerts, local_show_alerts, general_updates,
     * ticket_sale_alerts).
     */
    category: text('category').notNull().default('other'),
    /** Free-text question or message body from the visitor. */
    message: text('message').notNull(),
    visitorName: text('visitor_name'),
    visitorEmail: text('visitor_email'),
    /** City supplied for location-scoped intents (e.g. local show alerts). */
    visitorCity: text('visitor_city'),
    /** The question that preceded this capture, when it was escalated. */
    originatingQuestion: text('originating_question'),
    context: jsonb('context').$type<Record<string, unknown>>().default({}),
    status: text('status', { enum: ['new', 'read', 'archived'] })
      .notNull()
      .default('new'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    creatorProfileCreatedAtIdx: index(
      'profile_inquiries_creator_profile_id_created_at_idx'
    ).on(table.creatorProfileId, table.createdAt),
  })
);

export const insertProfileInquirySchema = createInsertSchema(profileInquiries);
export const selectProfileInquirySchema = createSelectSchema(profileInquiries);

export type ProfileInquiry = typeof profileInquiries.$inferSelect;
export type NewProfileInquiry = typeof profileInquiries.$inferInsert;
