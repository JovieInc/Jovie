import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
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
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import type { RichTextDocument } from '@/lib/rich-text/document';
import { memorySourceRecords } from './memory';
import { creatorProfiles } from './profiles';

export const creatorDocumentKindEnum = pgEnum('creator_document_kind', [
  'idea',
  'research',
  'script',
]);

export const creatorDocumentStageEnum = pgEnum('creator_document_stage', [
  'private_draft',
  'evidence_review',
  'creator_approved',
  'capture_ready',
]);

export const creatorClaimKindEnum = pgEnum('creator_claim_kind', [
  'fact',
  'inference',
  'opinion',
  'anecdote',
]);

export const creatorClaimEvidenceStateEnum = pgEnum(
  'creator_claim_evidence_state',
  ['supported', 'contested', 'unresolved']
);

export type CreatorDocumentContent = RichTextDocument;

export const creatorDocuments = pgTable(
  'creator_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: creatorDocumentKindEnum('kind').notNull().default('idea'),
    stage: creatorDocumentStageEnum('stage').notNull().default('private_draft'),
    currentRevision: integer('current_revision').notNull().default(1),
    captureIdempotencyKey: text('capture_idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    profileCreatedIdx: index('creator_documents_profile_created_idx').on(
      table.creatorProfileId,
      table.createdAt,
      table.id
    ),
    captureIdempotencyUnique: uniqueIndex(
      'creator_documents_capture_idempotency_unique'
    )
      .on(table.creatorProfileId, table.captureIdempotencyKey)
      .where(drizzleSql`capture_idempotency_key IS NOT NULL`),
    positiveRevision: check(
      'creator_documents_positive_revision',
      drizzleSql`${table.currentRevision} > 0`
    ),
  })
);

export const creatorDocumentRevisions = pgTable(
  'creator_document_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => creatorDocuments.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    title: text('title').notNull(),
    kind: creatorDocumentKindEnum('kind').notNull(),
    content: jsonb('content').$type<CreatorDocumentContent>().notNull(),
    plainText: text('plain_text').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    documentRevisionUnique: uniqueIndex(
      'creator_document_revisions_document_revision_unique'
    ).on(table.documentId, table.revision),
    contentHashIdx: index('creator_document_revisions_content_hash_idx').on(
      table.documentId,
      table.contentHash
    ),
    positiveRevision: check(
      'creator_document_revisions_positive_revision',
      drizzleSql`${table.revision} > 0 AND ${table.schemaVersion} > 0`
    ),
  })
);

export const creatorRevisionClaims = pgTable(
  'creator_revision_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => creatorDocumentRevisions.id, { onDelete: 'cascade' }),
    claimText: text('claim_text').notNull(),
    kind: creatorClaimKindEnum('kind').notNull(),
    evidenceState: creatorClaimEvidenceStateEnum('evidence_state')
      .notNull()
      .default('unresolved'),
    sourceRecordId: uuid('source_record_id').references(
      () => memorySourceRecords.id,
      { onDelete: 'restrict' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    revisionIdx: index('creator_revision_claims_revision_idx').on(
      table.revisionId
    ),
    supportedClaimsHaveEvidence: check(
      'creator_revision_claims_supported_have_evidence',
      drizzleSql`${table.evidenceState} <> 'supported' OR ${table.sourceRecordId} IS NOT NULL`
    ),
  })
);

export const creatorRevisionApprovals = pgTable(
  'creator_revision_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => creatorDocuments.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => creatorDocumentRevisions.id, { onDelete: 'restrict' }),
    approvedByUserId: text('approved_by_user_id').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  table => ({
    exactRevisionUnique: uniqueIndex(
      'creator_revision_approvals_exact_revision_unique'
    ).on(table.documentId, table.revisionId),
  })
);

export const creatorCaptureHandoffs = pgTable(
  'creator_capture_handoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => creatorDocuments.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => creatorDocumentRevisions.id, { onDelete: 'restrict' }),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => creatorRevisionApprovals.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    approvalUnique: uniqueIndex('creator_capture_handoffs_approval_unique').on(
      table.approvalId
    ),
    profileCreatedIdx: index('creator_capture_handoffs_profile_created_idx').on(
      table.creatorProfileId,
      table.createdAt
    ),
  })
);

export const insertCreatorDocumentSchema = createInsertSchema(creatorDocuments);
export const selectCreatorDocumentSchema = createSelectSchema(creatorDocuments);
export const insertCreatorDocumentRevisionSchema = createInsertSchema(
  creatorDocumentRevisions
);
export const selectCreatorDocumentRevisionSchema = createSelectSchema(
  creatorDocumentRevisions
);

export type CreatorDocument = typeof creatorDocuments.$inferSelect;
export type CreatorDocumentRevision =
  typeof creatorDocumentRevisions.$inferSelect;
