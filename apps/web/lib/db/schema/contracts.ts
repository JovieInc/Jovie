/**
 * Contracts & Agreements Schema
 *
 * Handles split sheets, producer agreements, session contracts, and licensing deals.
 * This module provides the foundation for documenting ownership and collaboration terms.
 *
 * Key concepts:
 * - Agreement: The master contract record
 * - Party: A signatory to the agreement (can be Jovie user or external collaborator)
 * - Split: Percentage ownership for different income types
 * - Template: Pre-built contract templates
 *
 * @see /future_features/contracts-documents.md for full specification
 */
import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { artists } from './content';
import { discogReleases, discogTracks } from './content';
import {
  agreementStatusEnum,
  agreementTypeEnum,
  artistRoleEnum,
  currencyCodeEnum,
  signatureStatusEnum,
  splitTypeEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// ============================================================================
// Agreement Tables
// ============================================================================

/**
 * Agreements - Master record for all contract types
 *
 * This is the primary table for split sheets, producer agreements,
 * session contracts, and licensing deals.
 */
export const agreements = pgTable(
  'agreements',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Owner (creator of the agreement)
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    // What this agreement covers
    agreementType: agreementTypeEnum('agreement_type').notNull(),
    title: text('title').notNull(),
    description: text('description'),

    // Link to content (optional - some agreements are pre-recording)
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'set null',
    }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'set null',
    }),

    // Status & lifecycle
    status: agreementStatusEnum('status').notNull().default('draft'),
    effectiveDate: timestamp('effective_date'),
    expirationDate: timestamp('expiration_date'),

    // Financial terms
    advanceAmount: integer('advance_amount'), // cents
    currency: currencyCodeEnum('currency').default('USD'),

    // Territory & rights
    territories: text('territories').array(), // ['US', 'CA', 'WW']
    isExclusive: boolean('is_exclusive').default(true),

    // Document generation
    templateId: text('template_id'),
    generatedDocumentUrl: text('generated_document_url'),

    // Signing
    signatureDeadline: timestamp('signature_deadline'),
    fullyExecutedAt: timestamp('fully_executed_at'),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    notes: text('notes'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Index for querying by creator
    creatorIndex: index('agreements_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    // Index for querying by status
    statusIndex: index('agreements_status_idx').on(table.status),
    // Index for querying by track
    trackIndex: index('agreements_track_id_idx').on(table.trackId),
    // Index for querying by release
    releaseIndex: index('agreements_release_id_idx').on(table.releaseId),
  })
);

/**
 * Agreement Parties - All signatories to an agreement
 *
 * Each party can be either:
 * - A Jovie user (linked via artistId -> creatorProfileId)
 * - An external collaborator (external fields filled in)
 */
export const agreementParties = pgTable(
  'agreement_parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),

    // Can be Jovie user or external collaborator
    artistId: uuid('artist_id').references(() => artists.id, {
      onDelete: 'cascade',
    }),

    // For external parties without Jovie accounts
    externalName: text('external_name'),
    externalEmail: text('external_email'),
    externalPhone: text('external_phone'),

    // Legal entity info
    legalName: text('legal_name'),
    publisherName: text('publisher_name'), // If represented by publisher
    proAffiliation: text('pro_affiliation'), // ASCAP, BMI, SESAC, etc.
    ipiNumber: text('ipi_number'), // International Publisher ID

    // Role in agreement
    role: artistRoleEnum('role').notNull(),
    isInitiator: boolean('is_initiator').default(false),

    // Signature
    signatureStatus: signatureStatusEnum('signature_status').default('pending'),
    signedAt: timestamp('signed_at'),
    signatureIp: text('signature_ip'),
    signatureData: jsonb('signature_data').$type<{
      type: 'typed' | 'drawn';
      value: string;
      timestamp: string;
    }>(),

    // Signature token for external signing flow
    signatureToken: text('signature_token'),
    signatureTokenExpiresAt: timestamp('signature_token_expires_at'),

    // Notification tracking
    lastNotifiedAt: timestamp('last_notified_at'),
    notificationCount: integer('notification_count').default(0),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Index for querying by agreement
    agreementIndex: index('agreement_parties_agreement_id_idx').on(
      table.agreementId
    ),
    // Index for querying by artist
    artistIndex: index('agreement_parties_artist_id_idx').on(table.artistId),
    // Index for signature token lookup
    tokenIndex: uniqueIndex('agreement_parties_signature_token_idx')
      .on(table.signatureToken)
      .where(drizzleSql`signature_token IS NOT NULL`),
    // Ensure either artistId OR external fields are populated
    partyIdentityConstraint: check(
      'agreement_parties_identity',
      drizzleSql`
        (artist_id IS NOT NULL)
        OR (external_name IS NOT NULL AND external_email IS NOT NULL)
      `
    ),
  })
);

/**
 * Agreement Splits - Ownership percentages per party
 *
 * Tracks separate percentages for different income types:
 * - Master: Sound recording ownership
 * - Publishing: Composition/songwriting
 * - Sync: Sync licensing share
 * - Performance: Performance royalties
 */
export const agreementSplits = pgTable(
  'agreement_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),

    partyId: uuid('party_id')
      .notNull()
      .references(() => agreementParties.id, { onDelete: 'cascade' }),

    splitType: splitTypeEnum('split_type').notNull(),
    percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull(), // 0.00 - 100.00

    // For complex deals with recoupment
    isRecoupable: boolean('is_recoupable').default(false),
    recoupmentSource: text('recoupment_source'), // What income applies

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Index for querying by agreement
    agreementIndex: index('agreement_splits_agreement_id_idx').on(
      table.agreementId
    ),
    // Splits percentage range validation
    splitPercentageRange: check(
      'agreement_splits_percentage_range',
      drizzleSql`percentage >= 0 AND percentage <= 100`
    ),
    // Unique split type per party per agreement
    partyTypeUnique: uniqueIndex('agreement_splits_party_type').on(
      table.agreementId,
      table.partyId,
      table.splitType
    ),
  })
);

/**
 * Agreement Templates - Pre-built contract templates
 *
 * Standard templates for common agreement types.
 * Templates use markdown with variable placeholders.
 */
export const agreementTemplates = pgTable(
  'agreement_templates',
  {
    id: text('id').primaryKey(), // e.g., 'split_sheet_standard'

    name: text('name').notNull(),
    description: text('description'),
    agreementType: agreementTypeEnum('agreement_type').notNull(),

    // Template content (markdown with variable placeholders)
    templateContent: text('template_content').notNull(),
    requiredFields: jsonb('required_fields').$type<string[]>().default([]),

    // Categorization
    isPublic: boolean('is_public').default(true),
    category: text('category'), // 'standard', 'sync', 'session', etc.
    jurisdiction: text('jurisdiction'), // 'US', 'UK', etc.

    // Usage tracking
    useCount: integer('use_count').default(0),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Index for querying by type
    typeIndex: index('agreement_templates_type_idx').on(table.agreementType),
  })
);

/**
 * Agreement Activity Log - Audit trail for all agreement actions
 *
 * Maintains a complete history of all actions taken on an agreement
 * for legal and compliance purposes.
 */
export const agreementActivityLog = pgTable(
  'agreement_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),

    // Actor can be null for system actions
    actorId: uuid('actor_id').references(() => creatorProfiles.id, {
      onDelete: 'set null',
    }),

    // Action type: created, sent, viewed, signed, modified, voided, etc.
    action: text('action').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}),

    // Request metadata for audit trail
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Index for querying by agreement
    agreementIndex: index('agreement_activity_log_agreement_id_idx').on(
      table.agreementId
    ),
    // Index for querying by action type
    actionIndex: index('agreement_activity_log_action_idx').on(table.action),
    // Index for time-based queries
    createdAtIndex: index('agreement_activity_log_created_at_idx').on(
      table.createdAt
    ),
  })
);

// ============================================================================
// Schema Validations
// ============================================================================

export const insertAgreementSchema = createInsertSchema(agreements);
export const selectAgreementSchema = createSelectSchema(agreements);

export const insertAgreementPartySchema = createInsertSchema(agreementParties);
export const selectAgreementPartySchema = createSelectSchema(agreementParties);

export const insertAgreementSplitSchema = createInsertSchema(agreementSplits);
export const selectAgreementSplitSchema = createSelectSchema(agreementSplits);

export const insertAgreementTemplateSchema =
  createInsertSchema(agreementTemplates);
export const selectAgreementTemplateSchema =
  createSelectSchema(agreementTemplates);

export const insertAgreementActivityLogSchema =
  createInsertSchema(agreementActivityLog);
export const selectAgreementActivityLogSchema =
  createSelectSchema(agreementActivityLog);

// ============================================================================
// Types
// ============================================================================

export type Agreement = typeof agreements.$inferSelect;
export type NewAgreement = typeof agreements.$inferInsert;

export type AgreementParty = typeof agreementParties.$inferSelect;
export type NewAgreementParty = typeof agreementParties.$inferInsert;

export type AgreementSplit = typeof agreementSplits.$inferSelect;
export type NewAgreementSplit = typeof agreementSplits.$inferInsert;

export type AgreementTemplate = typeof agreementTemplates.$inferSelect;
export type NewAgreementTemplate = typeof agreementTemplates.$inferInsert;

export type AgreementActivityLog = typeof agreementActivityLog.$inferSelect;
export type NewAgreementActivityLog = typeof agreementActivityLog.$inferInsert;

// Enum value types
export type AgreementType = (typeof agreementTypeEnum.enumValues)[number];
export type AgreementStatus = (typeof agreementStatusEnum.enumValues)[number];
export type SplitType = (typeof splitTypeEnum.enumValues)[number];
export type SignatureStatus = (typeof signatureStatusEnum.enumValues)[number];
