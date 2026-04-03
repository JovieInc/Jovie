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
import { discogReleases } from './content';
import {
  metadataSubmissionIssueStatusEnum,
  metadataSubmissionStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

export interface MetadataSubmissionSnapshotData {
  artistName?: string | null;
  releaseTitle?: string | null;
  releaseDate?: string | null;
  upc?: string | null;
  trackCount?: number | null;
  hasCredits?: boolean;
  hasBio?: boolean;
  hasArtistImage?: boolean;
  hasArtwork?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

export const metadataSubmissionRequests = pgTable(
  'metadata_submission_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    providerId: text('provider_id').notNull(),
    status: metadataSubmissionStatusEnum('status').notNull().default('draft'),
    approvedAt: timestamp('approved_at'),
    sentAt: timestamp('sent_at'),
    latestSnapshotAt: timestamp('latest_snapshot_at'),
    providerMessageId: text('provider_message_id'),
    replyToEmail: text('reply_to_email'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorStatusIdx: index(
      'metadata_submission_requests_creator_status_idx'
    ).on(table.creatorProfileId, table.status, table.createdAt),
    releaseIdx: index('metadata_submission_requests_release_idx').on(
      table.releaseId,
      table.createdAt
    ),
  })
);

export const metadataSubmissionArtifacts = pgTable(
  'metadata_submission_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => metadataSubmissionRequests.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    textBody: text('text_body'),
    blobUrl: text('blob_url'),
    checksum: text('checksum').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    requestKindIdx: index('metadata_submission_artifacts_request_kind_idx').on(
      table.requestId,
      table.kind
    ),
  })
);

export const metadataSubmissionTargets = pgTable(
  'metadata_submission_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => metadataSubmissionRequests.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    externalId: text('external_id'),
    discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at'),
  },
  table => ({
    requestTargetIdx: index('metadata_submission_targets_request_idx').on(
      table.requestId,
      table.targetType
    ),
    requestUrlUnique: uniqueIndex(
      'metadata_submission_targets_request_url_unique'
    ).on(table.requestId, table.canonicalUrl),
  })
);

export const metadataSubmissionSnapshots = pgTable(
  'metadata_submission_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => metadataSubmissionRequests.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').references(() => metadataSubmissionTargets.id, {
      onDelete: 'cascade',
    }),
    snapshotType: text('snapshot_type').notNull(),
    normalizedData: jsonb('normalized_data')
      .$type<MetadataSubmissionSnapshotData>()
      .default({})
      .notNull(),
    hash: text('hash').notNull(),
    observedAt: timestamp('observed_at').defaultNow().notNull(),
  },
  table => ({
    requestSnapshotIdx: index('metadata_submission_snapshots_request_idx').on(
      table.requestId,
      table.snapshotType,
      table.observedAt
    ),
    targetObservedIdx: index('metadata_submission_snapshots_target_idx').on(
      table.targetId,
      table.observedAt
    ),
  })
);

export const metadataSubmissionIssues = pgTable(
  'metadata_submission_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => metadataSubmissionRequests.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    issueType: text('issue_type').notNull(),
    severity: text('severity').notNull(),
    expectedValue: text('expected_value'),
    observedValue: text('observed_value'),
    status: metadataSubmissionIssueStatusEnum('status')
      .notNull()
      .default('open'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  table => ({
    requestStatusIdx: index('metadata_submission_issues_request_status_idx').on(
      table.requestId,
      table.status,
      table.createdAt
    ),
  })
);

export const insertMetadataSubmissionRequestSchema = createInsertSchema(
  metadataSubmissionRequests
);
export const selectMetadataSubmissionRequestSchema = createSelectSchema(
  metadataSubmissionRequests
);
export type MetadataSubmissionRequest =
  typeof metadataSubmissionRequests.$inferSelect;
export type NewMetadataSubmissionRequest =
  typeof metadataSubmissionRequests.$inferInsert;

export const insertMetadataSubmissionArtifactSchema = createInsertSchema(
  metadataSubmissionArtifacts
);
export const selectMetadataSubmissionArtifactSchema = createSelectSchema(
  metadataSubmissionArtifacts
);
export type MetadataSubmissionArtifact =
  typeof metadataSubmissionArtifacts.$inferSelect;
export type NewMetadataSubmissionArtifact =
  typeof metadataSubmissionArtifacts.$inferInsert;

export const insertMetadataSubmissionTargetSchema = createInsertSchema(
  metadataSubmissionTargets
);
export const selectMetadataSubmissionTargetSchema = createSelectSchema(
  metadataSubmissionTargets
);
export type MetadataSubmissionTarget =
  typeof metadataSubmissionTargets.$inferSelect;
export type NewMetadataSubmissionTarget =
  typeof metadataSubmissionTargets.$inferInsert;

export const insertMetadataSubmissionSnapshotSchema = createInsertSchema(
  metadataSubmissionSnapshots
);
export const selectMetadataSubmissionSnapshotSchema = createSelectSchema(
  metadataSubmissionSnapshots
);
export type MetadataSubmissionSnapshot =
  typeof metadataSubmissionSnapshots.$inferSelect;
export type NewMetadataSubmissionSnapshot =
  typeof metadataSubmissionSnapshots.$inferInsert;

export const insertMetadataSubmissionIssueSchema = createInsertSchema(
  metadataSubmissionIssues
);
export const selectMetadataSubmissionIssueSchema = createSelectSchema(
  metadataSubmissionIssues
);
export type MetadataSubmissionIssue =
  typeof metadataSubmissionIssues.$inferSelect;
export type NewMetadataSubmissionIssue =
  typeof metadataSubmissionIssues.$inferInsert;
