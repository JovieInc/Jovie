import {
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
import { users } from './auth';
import { creatorProfiles } from './profiles';

export const libraryPresenceFindingKindEnum = pgEnum(
  'library_presence_finding_kind',
  ['repair', 'collision', 'placement_opportunity']
);

export const libraryPresenceIssueTypeEnum = pgEnum(
  'library_presence_issue_type',
  [
    'dead_link',
    'missing_jovie_link',
    'wrong_artist',
    'wrong_song',
    'wrong_identifier',
    'placement_opportunity',
  ]
);

export const libraryPresenceActionModeEnum = pgEnum(
  'library_presence_action_mode',
  ['direct_update', 'draft_request', 'filter_only']
);

export const libraryPresenceFindingStatusEnum = pgEnum(
  'library_presence_finding_status',
  ['open', 'drafted', 'resolved', 'dismissed']
);

export const libraryCollisionDispositionEnum = pgEnum(
  'library_collision_disposition',
  ['unreviewed', 'not_this_artist', 'not_this_song', 'confirmed_match']
);

export const rightsholderEvidenceClassEnum = pgEnum(
  'rightsholder_evidence_class',
  ['attested', 'observed', 'claimed']
);

export const rightsholderEvidenceSourceEnum = pgEnum(
  'rightsholder_evidence_source',
  ['artist_attestation', 'songview', 'mlc', 'catalog', 'other']
);

export const rightsholderDomainEnum = pgEnum('rightsholder_domain', [
  'composition',
  'master',
  'unknown',
]);

export const libraryPresenceFindings = pgTable(
  'library_presence_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type')
      .$type<'artist' | 'release' | 'recording' | 'track'>()
      .notNull(),
    subjectId: text('subject_id').notNull(),
    kind: libraryPresenceFindingKindEnum('kind').notNull(),
    issueType: libraryPresenceIssueTypeEnum('issue_type').notNull(),
    platform: text('platform').notNull(),
    sourceKey: text('source_key').notNull(),
    title: text('title').notNull(),
    currentUrl: text('current_url'),
    expectedUrl: text('expected_url'),
    actionMode: libraryPresenceActionModeEnum('action_mode').notNull(),
    status: libraryPresenceFindingStatusEnum('status')
      .notNull()
      .default('open'),
    collisionDisposition: libraryCollisionDispositionEnum(
      'collision_disposition'
    ),
    draftRequest: text('draft_request'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('library_presence_findings_source_unique').on(
      table.creatorProfileId,
      table.sourceKey
    ),
    index('library_presence_findings_queue_idx').on(
      table.creatorProfileId,
      table.subjectType,
      table.subjectId,
      table.kind,
      table.status
    ),
  ]
);

export const libraryRightsholderEvidence = pgTable(
  'library_rightsholder_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type')
      .$type<'release' | 'recording' | 'track'>()
      .notNull(),
    subjectId: text('subject_id').notNull(),
    partyName: text('party_name').notNull(),
    role: text('role').notNull(),
    domain: rightsholderDomainEnum('domain').notNull(),
    evidenceClass: rightsholderEvidenceClassEnum('evidence_class').notNull(),
    source: rightsholderEvidenceSourceEnum('source').notNull(),
    shareBps: integer('share_bps'),
    sourceWorkId: text('source_work_id'),
    sourceUrl: text('source_url'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('library_rightsholder_evidence_subject_idx').on(
      table.creatorProfileId,
      table.subjectType,
      table.subjectId,
      table.evidenceClass
    ),
  ]
);

export const insertLibraryPresenceFindingSchema = createInsertSchema(
  libraryPresenceFindings
);
export const selectLibraryPresenceFindingSchema = createSelectSchema(
  libraryPresenceFindings
);
export const insertLibraryRightsholderEvidenceSchema = createInsertSchema(
  libraryRightsholderEvidence
);
export const selectLibraryRightsholderEvidenceSchema = createSelectSchema(
  libraryRightsholderEvidence
);

export type LibraryPresenceFinding =
  typeof libraryPresenceFindings.$inferSelect;
export type LibraryRightsholderEvidence =
  typeof libraryRightsholderEvidence.$inferSelect;
