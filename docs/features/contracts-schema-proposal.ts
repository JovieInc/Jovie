/**
 * Contracts & Documents Schema Proposal
 *
 * This is a PROPOSAL file - not meant for direct import into the codebase.
 * Review and iterate before implementing as actual migrations.
 *
 * Phase 1: Split Sheets (MVP)
 * Phase 2: Session Agreements
 * Phase 3: Licensing Contracts
 * Phase 4: Royalty Tracking (future)
 */

import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Import existing schemas (for reference - these already exist)
// import { discogTracks, discogReleases, artists, creatorProfiles, users } from './existing';

// ============================================================================
// NEW ENUMS
// ============================================================================

/**
 * Split sheet status - tracks the lifecycle of a split sheet
 */
export const splitSheetStatusEnum = pgEnum('split_sheet_status', [
  'draft', // Created but not sent for signatures
  'pending_signatures', // Sent to collaborators, awaiting signatures
  'partially_signed', // Some but not all parties have signed
  'completed', // All parties have signed
  'disputed', // Someone has raised a dispute
  'voided', // Cancelled/invalidated
]);

/**
 * Split type - what kind of ownership the split represents
 */
export const splitTypeEnum = pgEnum('split_type', [
  'master', // Master recording ownership
  'publishing', // Publishing/composition ownership
  'both', // Combined (simple mode for artists who don't differentiate)
]);

/**
 * Session agreement status
 */
export const sessionAgreementStatusEnum = pgEnum('session_agreement_status', [
  'active', // Session is ongoing, agreement is in effect
  'converted', // Session produced content, converted to split sheet(s)
  'cancelled', // Session was cancelled, no content created
  'expired', // Session agreement expired without being used
]);

/**
 * Contract status - for licensing and other contracts
 */
export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'negotiating', // Back and forth between parties
  'pending_signatures',
  'active', // Signed and in effect
  'expired', // Past expiration date
  'terminated', // Ended early by one or both parties
  'disputed',
]);

/**
 * Contract/License type
 */
export const contractTypeEnum = pgEnum('contract_type', [
  'sync', // Sync license (film/TV/ads)
  'sample', // Sample clearance
  'remix', // Remix license/agreement
  'beat', // Beat license (producer selling beats)
  'feature', // Feature/guest verse agreement
  'distribution', // Distribution agreement
  'management', // Management contract
  'custom', // Custom/other
]);

/**
 * Royalty payment frequency
 */
export const royaltyFrequencyEnum = pgEnum('royalty_frequency', [
  'per_use', // One-time per use
  'monthly',
  'quarterly',
  'semi_annually',
  'annually',
]);

// ============================================================================
// PHASE 1: SPLIT SHEETS (MVP)
// ============================================================================

/**
 * Split Sheets - The core document for ownership splits
 *
 * Can be attached to a track, release, or stand-alone (for unreleased work).
 * Auto-populated from trackArtists when created from a track.
 */
export const splitSheets = pgTable(
  'split_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // What this split sheet is for (at least one should be set, or none for unreleased)
    trackId: uuid('track_id'), // .references(() => discogTracks.id)
    releaseId: uuid('release_id'), // .references(() => discogReleases.id)

    // Creator/owner of this split sheet
    createdByUserId: uuid('created_by_user_id').notNull(), // .references(() => users.id)
    creatorProfileId: uuid('creator_profile_id').notNull(), // .references(() => creatorProfiles.id)

    // Content details (can differ from track if track doesn't exist yet)
    title: text('title').notNull(),
    alternativeTitles: jsonb('alternative_titles')
      .$type<string[]>()
      .default([]),
    workingTitle: text('working_title'), // If different from final title

    // Type of split
    splitType: splitTypeEnum('split_type').notNull().default('both'),

    // Status
    status: splitSheetStatusEnum('status').notNull().default('draft'),

    // Timestamps
    sentForSignaturesAt: timestamp('sent_for_signatures_at'),
    completedAt: timestamp('completed_at'),
    expiresAt: timestamp('expires_at'), // For drafts - auto-cleanup

    // Notes/context
    notes: text('notes'), // Internal notes about this split

    // Metadata for extensibility
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for common queries
    trackIndex: index('split_sheets_track_id_idx').on(table.trackId),
    releaseIndex: index('split_sheets_release_id_idx').on(table.releaseId),
    creatorIndex: index('split_sheets_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    statusIndex: index('split_sheets_status_idx').on(table.status),

    // Ensure track/release references are valid (if both set, they should match)
    // This would be enforced at application level
  })
);

/**
 * Split Sheet Parties - Who is involved in the split and their percentage
 *
 * Each party can be a Jovie user (artistId with creatorProfileId) or
 * an external collaborator (artistId without creatorProfileId, or just email).
 */
export const splitSheetParties = pgTable(
  'split_sheet_parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    splitSheetId: uuid('split_sheet_id').notNull(), // .references(() => splitSheets.id)

    // The artist (can be Jovie user or external collaborator from artists table)
    artistId: uuid('artist_id'), // .references(() => artists.id)

    // For external collaborators not in artists table yet
    externalName: text('external_name'),
    externalEmail: text('external_email'),

    // Role in the work (from existing artistRoleEnum)
    role: text('role').notNull(), // Using text for flexibility, can validate against artistRoleEnum

    // Split percentages (stored as decimal, e.g., 25.5 for 25.5%)
    masterPercentage: decimal('master_percentage', {
      precision: 5,
      scale: 2,
    }),
    publishingPercentage: decimal('publishing_percentage', {
      precision: 5,
      scale: 2,
    }),

    // For 'both' split type, this is used instead
    combinedPercentage: decimal('combined_percentage', {
      precision: 5,
      scale: 2,
    }),

    // PRO (Performance Rights Organization) info for publishing
    proAffiliation: text('pro_affiliation'), // ASCAP, BMI, SESAC, PRS, etc.
    ipiNumber: text('ipi_number'), // International identification number

    // Signature status
    signatureStatus: text('signature_status')
      .notNull()
      .default('pending'), // pending, signed, declined
    signedAt: timestamp('signed_at'),
    signatureIpAddress: text('signature_ip_address'),
    signatureUserAgent: text('signature_user_agent'),

    // For non-Jovie users, we track invitation status
    inviteToken: text('invite_token'), // Unique token for signing link
    inviteSentAt: timestamp('invite_sent_at'),
    inviteReminderCount: integer('invite_reminder_count').default(0),

    // Position in the credit list
    position: integer('position').default(0).notNull(),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    splitSheetIndex: index('split_sheet_parties_split_sheet_id_idx').on(
      table.splitSheetId
    ),
    artistIndex: index('split_sheet_parties_artist_id_idx').on(table.artistId),

    // Unique invite token
    inviteTokenUnique: uniqueIndex('split_sheet_parties_invite_token_unique')
      .on(table.inviteToken)
      .where(drizzleSql`invite_token IS NOT NULL`),

    // Ensure either artistId or external info is provided
    partyIdentityConstraint: check(
      'split_sheet_parties_identity',
      drizzleSql`
        artist_id IS NOT NULL
        OR (external_name IS NOT NULL AND external_email IS NOT NULL)
      `
    ),

    // Ensure percentage fields are valid (0-100)
    masterPercentageRange: check(
      'split_sheet_parties_master_percentage_range',
      drizzleSql`master_percentage IS NULL OR (master_percentage >= 0 AND master_percentage <= 100)`
    ),
    publishingPercentageRange: check(
      'split_sheet_parties_publishing_percentage_range',
      drizzleSql`publishing_percentage IS NULL OR (publishing_percentage >= 0 AND publishing_percentage <= 100)`
    ),
    combinedPercentageRange: check(
      'split_sheet_parties_combined_percentage_range',
      drizzleSql`combined_percentage IS NULL OR (combined_percentage >= 0 AND combined_percentage <= 100)`
    ),
  })
);

/**
 * Split Sheet Audit Log - Track all changes to split sheets
 *
 * Important for legal defensibility.
 */
export const splitSheetAuditLog = pgTable(
  'split_sheet_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    splitSheetId: uuid('split_sheet_id').notNull(), // .references(() => splitSheets.id)

    action: text('action').notNull(), // created, updated, sent, signed, completed, disputed, voided
    actorUserId: uuid('actor_user_id'), // Who performed the action (null for system actions)
    actorEmail: text('actor_email'), // For external signers

    // What changed
    previousState: jsonb('previous_state').$type<Record<string, unknown>>(),
    newState: jsonb('new_state').$type<Record<string, unknown>>(),

    // Context
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    splitSheetIndex: index('split_sheet_audit_log_split_sheet_id_idx').on(
      table.splitSheetId
    ),
    actionIndex: index('split_sheet_audit_log_action_idx').on(table.action),
    createdAtIndex: index('split_sheet_audit_log_created_at_idx').on(
      table.createdAt
    ),
  })
);

// ============================================================================
// PHASE 2: SESSION AGREEMENTS
// ============================================================================

/**
 * Session Agreements - Pre-session agreements for studio sessions
 *
 * "Before we hit the studio, let's agree that anything we create is 50/50"
 */
export const sessionAgreements = pgTable(
  'session_agreements',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Creator/owner
    createdByUserId: uuid('created_by_user_id').notNull(),
    creatorProfileId: uuid('creator_profile_id').notNull(),

    // Session details
    sessionName: text('session_name').notNull(), // "Studio Session with Producer X"
    sessionDate: timestamp('session_date'),
    sessionLocation: text('session_location'),

    // Default split terms (applied to any content created)
    defaultSplitType: splitTypeEnum('default_split_type')
      .notNull()
      .default('both'),
    defaultTerms: jsonb('default_terms').$type<{
      masterSplits?: Record<string, number>; // artistId -> percentage
      publishingSplits?: Record<string, number>;
      combinedSplits?: Record<string, number>;
    }>(),

    status: sessionAgreementStatusEnum('status').notNull().default('active'),

    // When content is created, link to resulting split sheets
    resultingSplitSheetIds: jsonb('resulting_split_sheet_ids')
      .$type<string[]>()
      .default([]),

    // Validity period
    validFrom: timestamp('valid_from').defaultNow(),
    validUntil: timestamp('valid_until'), // null = no expiration

    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    creatorIndex: index('session_agreements_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    statusIndex: index('session_agreements_status_idx').on(table.status),
    sessionDateIndex: index('session_agreements_session_date_idx').on(
      table.sessionDate
    ),
  })
);

/**
 * Session Agreement Participants - Who agreed to the session terms
 */
export const sessionAgreementParticipants = pgTable(
  'session_agreement_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionAgreementId: uuid('session_agreement_id').notNull(),

    artistId: uuid('artist_id'),
    externalName: text('external_name'),
    externalEmail: text('external_email'),

    // Agreed percentage (for combined splits)
    agreedPercentage: decimal('agreed_percentage', { precision: 5, scale: 2 }),

    // Signature
    signatureStatus: text('signature_status').notNull().default('pending'),
    signedAt: timestamp('signed_at'),

    inviteToken: text('invite_token'),
    inviteSentAt: timestamp('invite_sent_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sessionAgreementIndex: index(
      'session_agreement_participants_session_id_idx'
    ).on(table.sessionAgreementId),
    artistIndex: index('session_agreement_participants_artist_id_idx').on(
      table.artistId
    ),
    inviteTokenUnique: uniqueIndex(
      'session_agreement_participants_invite_token_unique'
    )
      .on(table.inviteToken)
      .where(drizzleSql`invite_token IS NOT NULL`),
  })
);

// ============================================================================
// PHASE 3: LICENSING CONTRACTS
// ============================================================================

/**
 * Contract Templates - Reusable templates for common contract types
 *
 * Jovie provides default templates, users can create custom ones.
 */
export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // null for Jovie default templates
    createdByUserId: uuid('created_by_user_id'),

    name: text('name').notNull(),
    description: text('description'),
    contractType: contractTypeEnum('contract_type').notNull(),

    // Template content - modular sections
    sections: jsonb('sections').$type<
      Array<{
        id: string;
        title: string;
        content: string; // Markdown with variable placeholders like {{licensor_name}}
        isRequired: boolean;
        order: number;
      }>
    >(),

    // Variables that need to be filled in
    variables: jsonb('variables').$type<
      Array<{
        name: string; // e.g., "licensor_name", "fee_amount"
        type: 'text' | 'number' | 'date' | 'currency' | 'percentage';
        label: string;
        required: boolean;
        defaultValue?: string | number;
      }>
    >(),

    // Template metadata
    jurisdiction: text('jurisdiction'), // US, UK, EU, etc.
    language: text('language').default('en'),
    version: integer('version').default(1),
    isPublic: boolean('is_public').default(false), // Can others use this template?
    isDefault: boolean('is_default').default(false), // Jovie default template

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    contractTypeIndex: index('contract_templates_contract_type_idx').on(
      table.contractType
    ),
    isPublicIndex: index('contract_templates_is_public_idx').on(table.isPublic),
    isDefaultIndex: index('contract_templates_is_default_idx').on(
      table.isDefault
    ),
  })
);

/**
 * Contracts - Actual contracts between parties
 */
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Template used (optional - can be fully custom)
    templateId: uuid('template_id'), // .references(() => contractTemplates.id)

    // Creator/owner
    createdByUserId: uuid('created_by_user_id').notNull(),
    creatorProfileId: uuid('creator_profile_id').notNull(),

    // What this contract is for
    trackId: uuid('track_id'),
    releaseId: uuid('release_id'),

    // Contract details
    title: text('title').notNull(),
    contractType: contractTypeEnum('contract_type').notNull(),

    // Filled-in terms (variable values)
    terms: jsonb('terms').$type<Record<string, unknown>>(),

    // Custom sections/clauses added beyond template
    customSections: jsonb('custom_sections').$type<
      Array<{
        title: string;
        content: string;
        order: number;
      }>
    >(),

    // Status
    status: contractStatusEnum('status').notNull().default('draft'),

    // Dates
    effectiveDate: timestamp('effective_date'),
    expirationDate: timestamp('expiration_date'),
    terminatedAt: timestamp('terminated_at'),
    terminationReason: text('termination_reason'),

    // Financial terms (denormalized for easy querying)
    upfrontFee: integer('upfront_fee'), // In cents
    upfrontFeeCurrency: text('upfront_fee_currency').default('USD'),
    royaltyRate: decimal('royalty_rate', { precision: 5, scale: 2 }), // Percentage
    royaltyFrequency: royaltyFrequencyEnum('royalty_frequency'),

    // Territory/exclusivity
    territories: jsonb('territories').$type<string[]>().default([]), // ISO country codes, empty = worldwide
    isExclusive: boolean('is_exclusive').default(false),

    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    templateIndex: index('contracts_template_id_idx').on(table.templateId),
    creatorIndex: index('contracts_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    trackIndex: index('contracts_track_id_idx').on(table.trackId),
    releaseIndex: index('contracts_release_id_idx').on(table.releaseId),
    statusIndex: index('contracts_status_idx').on(table.status),
    contractTypeIndex: index('contracts_contract_type_idx').on(
      table.contractType
    ),
  })
);

/**
 * Contract Parties - Signatories to a contract
 */
export const contractParties = pgTable(
  'contract_parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id').notNull(),

    artistId: uuid('artist_id'),
    externalName: text('external_name'),
    externalEmail: text('external_email'),
    companyName: text('company_name'), // For business entities

    // Role in contract
    role: text('role').notNull(), // licensor, licensee, grantor, grantee, etc.

    // Signature
    signatureStatus: text('signature_status').notNull().default('pending'),
    signedAt: timestamp('signed_at'),
    signatureIpAddress: text('signature_ip_address'),

    inviteToken: text('invite_token'),
    inviteSentAt: timestamp('invite_sent_at'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    contractIndex: index('contract_parties_contract_id_idx').on(
      table.contractId
    ),
    artistIndex: index('contract_parties_artist_id_idx').on(table.artistId),
    inviteTokenUnique: uniqueIndex('contract_parties_invite_token_unique')
      .on(table.inviteToken)
      .where(drizzleSql`invite_token IS NOT NULL`),
  })
);

/**
 * Contract Audit Log - Track all changes to contracts
 */
export const contractAuditLog = pgTable(
  'contract_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id').notNull(),

    action: text('action').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorEmail: text('actor_email'),

    previousState: jsonb('previous_state').$type<Record<string, unknown>>(),
    newState: jsonb('new_state').$type<Record<string, unknown>>(),

    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    contractIndex: index('contract_audit_log_contract_id_idx').on(
      table.contractId
    ),
    actionIndex: index('contract_audit_log_action_idx').on(table.action),
  })
);

// ============================================================================
// PHASE 4: ROYALTY TRACKING (FUTURE)
// ============================================================================

/**
 * Royalty Statements - Track royalty calculations and payments
 *
 * FUTURE: This would integrate with actual revenue data from distributors.
 */
export const royaltyStatements = pgTable(
  'royalty_statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to contract or split sheet
    contractId: uuid('contract_id'),
    splitSheetId: uuid('split_sheet_id'),

    // Period covered
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),

    // Revenue data
    grossRevenue: integer('gross_revenue').notNull(), // In cents
    currency: text('currency').default('USD'),

    // Calculated splits
    splits: jsonb('splits').$type<
      Array<{
        partyId: string; // splitSheetPartyId or contractPartyId
        artistId?: string;
        percentage: number;
        amount: number; // In cents
      }>
    >(),

    // Status
    status: text('status').notNull().default('calculated'), // calculated, approved, paid

    // Payment tracking (if we handle payouts)
    paidAt: timestamp('paid_at'),
    stripePayoutIds: jsonb('stripe_payout_ids').$type<string[]>(),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    contractIndex: index('royalty_statements_contract_id_idx').on(
      table.contractId
    ),
    splitSheetIndex: index('royalty_statements_split_sheet_id_idx').on(
      table.splitSheetId
    ),
    periodIndex: index('royalty_statements_period_idx').on(
      table.periodStart,
      table.periodEnd
    ),
    statusIndex: index('royalty_statements_status_idx').on(table.status),
  })
);

// ============================================================================
// TYPE EXPORTS (for reference)
// ============================================================================

export type SplitSheet = typeof splitSheets.$inferSelect;
export type NewSplitSheet = typeof splitSheets.$inferInsert;

export type SplitSheetParty = typeof splitSheetParties.$inferSelect;
export type NewSplitSheetParty = typeof splitSheetParties.$inferInsert;

export type SessionAgreement = typeof sessionAgreements.$inferSelect;
export type NewSessionAgreement = typeof sessionAgreements.$inferInsert;

export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type NewContractTemplate = typeof contractTemplates.$inferInsert;

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type RoyaltyStatement = typeof royaltyStatements.$inferSelect;
export type NewRoyaltyStatement = typeof royaltyStatements.$inferInsert;
