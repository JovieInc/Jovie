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
 * Profile inquiries — visitor messages, intents, and unanswered questions
 * captured by the public "Ask Jovie" surface on a creator's profile.
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
    /** Message category (fan_mail, booking, …) or intent id for intents. */
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
