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
import { contactLifecycleStageEnum } from './enums';
import { leads } from './leads';
import { creatorProfiles } from './profiles';
import { waitlistEntries } from './waitlist';

/**
 * Canonical customer/prospect record (JOV-6888).
 *
 * One row per person across waitlist, lead, creator-profile, and user sources.
 * Rows are upserted lazily by dedupe key (normalized email, else normalized
 * handle) when a founder or agent records a stage transition, so read paths can
 * always derive live state from the source tables while this table carries the
 * durable canonical identity and any founder-applied stage override.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable identity across sources: `email:<normalized>` or `handle:<normalized>`. */
    dedupeKey: text('dedupe_key').notNull(),
    displayName: text('display_name'),
    emailNormalized: text('email_normalized'),
    primaryHandle: text('primary_handle'),
    avatarUrl: text('avatar_url'),

    stage: contactLifecycleStageEnum('stage').default('suggested').notNull(),
    stageEnteredAt: timestamp('stage_entered_at'),
    /** Which signal set the current stage (`founder`, `agent`, `system:*`). */
    stageSource: text('stage_source'),

    certifiedAt: timestamp('certified_at'),
    certifiedByUserId: uuid('certified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),
    leadId: uuid('lead_id').references(() => leads.id, {
      onDelete: 'set null',
    }),
    waitlistEntryId: uuid('waitlist_entry_id').references(
      () => waitlistEntries.id,
      { onDelete: 'set null' }
    ),

    /** Source/provenance map, e.g. `{ sources: ['waitlist','lead'] }`. */
    provenance: jsonb('provenance').$type<Record<string, unknown>>(),

    firstSeenAt: timestamp('first_seen_at'),
    lastActivityAt: timestamp('last_activity_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    dedupeKeyUnique: uniqueIndex('idx_contacts_dedupe_key_unique').on(
      table.dedupeKey
    ),
    stageIndex: index('idx_contacts_stage').on(table.stage),
    emailNormalizedIndex: index('idx_contacts_email_normalized').on(
      table.emailNormalized
    ),
    userIdIndex: index('idx_contacts_user_id').on(table.userId),
    creatorProfileIdIndex: index('idx_contacts_creator_profile_id').on(
      table.creatorProfileId
    ),
  })
);

/** Append-only history of lifecycle stage transitions with provenance. */
export const contactStageTransitions = pgTable(
  'contact_stage_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    /** Denormalized for timeline queries that outlive contact re-keying. */
    dedupeKey: text('dedupe_key').notNull(),
    fromStage: contactLifecycleStageEnum('from_stage'),
    toStage: contactLifecycleStageEnum('to_stage').notNull(),
    /** `founder` | `agent` | `system` */
    actorType: text('actor_type').default('system').notNull(),
    actorId: text('actor_id'),
    /** Provenance, e.g. `waitlist`, `lead`, `admin_contacts`. */
    source: text('source'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    contactCreatedAtIndex: index(
      'idx_contact_stage_transitions_contact_created_at'
    ).on(table.contactId, table.createdAt),
    dedupeKeyIndex: index('idx_contact_stage_transitions_dedupe_key').on(
      table.dedupeKey
    ),
  })
);

// Schema validations
export const insertContactSchema = createInsertSchema(contacts);
export const selectContactSchema = createSelectSchema(contacts);
export const insertContactStageTransitionSchema = createInsertSchema(
  contactStageTransitions
);
export const selectContactStageTransitionSchema = createSelectSchema(
  contactStageTransitions
);

// Types
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactStageTransition =
  typeof contactStageTransitions.$inferSelect;
export type NewContactStageTransition =
  typeof contactStageTransitions.$inferInsert;
