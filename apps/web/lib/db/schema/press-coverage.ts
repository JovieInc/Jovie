import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { audienceSourceLinks } from './analytics';
import { discogReleases } from './content';
import { creatorProfiles } from './profiles';

export const pressCoverageStatusEnum = pgEnum('press_coverage_status', [
  'draft',
  'published',
  'archived',
]);

export const pressCoverageExcerptKindEnum = pgEnum(
  'press_coverage_excerpt_kind',
  ['excerpt', 'creator_summary']
);

export const pressCoverageProvenanceEnum = pgEnum('press_coverage_provenance', [
  'verified_inspection',
  'creator_attested',
]);

/**
 * Bounded provenance evidence captured at publication time. Never the full
 * article body — the row holds a verified source URL plus the minimal
 * headline/date evidence needed to render the coverage card.
 */
export interface PressCoverageInspection {
  readonly inspectedAt: string;
  readonly freshness: string;
  readonly factualVerification: false;
  readonly publishedAtSource: string | null;
}

/**
 * Creator-owned press coverage pages (press-to-audience pilot, JOV-7408).
 *
 * Each row binds a genuine third-party article to the correct creator/work
 * via provenance-bound inspection (lib/ai/tools/extract-press-source.ts).
 * `status` gates public rendering: only `published` rows with
 * `mentionVerified = true` may render as third-party coverage.
 */
export const pressCoverages = pgTable(
  'press_coverages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Public page code used in /{username}/press/{slug} */
    slug: text('slug').notNull(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'set null',
    }),
    /** Canonical final URL after redirect validation */
    sourceUrl: text('source_url').notNull(),
    publisherDomain: text('publisher_domain').notNull(),
    publisherName: text('publisher_name'),
    headline: text('headline'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Bounded excerpt or creator-authored summary — never the full article */
    excerpt: text('excerpt'),
    excerptKind: pressCoverageExcerptKindEnum('excerpt_kind')
      .notNull()
      .default('creator_summary'),
    provenance: pressCoverageProvenanceEnum('provenance').notNull(),
    /** Article text contains the creator's display name or handle */
    mentionVerified: boolean('mention_verified').notNull().default(false),
    inspection: jsonb('inspection').$type<PressCoverageInspection>().notNull(),
    /** Tracked outbound link (/s/[code]) used by "Read on {publisher}" */
    outboundSourceLinkId: uuid('outbound_source_link_id').references(
      () => audienceSourceLinks.id,
      { onDelete: 'set null' }
    ),
    experimentKey: text('experiment_key')
      .notNull()
      .default('LAUNCH-AUDIENCE-2026-10-01/press-to-audience'),
    status: pressCoverageStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    slugUnique: uniqueIndex('press_coverages_slug_unique').on(table.slug),
    profileStatusIdx: index('press_coverages_creator_profile_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
  })
);

export const insertPressCoverageSchema = createInsertSchema(pressCoverages);
export const selectPressCoverageSchema = createSelectSchema(pressCoverages);
export type PressCoverage = typeof pressCoverages.$inferSelect;
export type NewPressCoverage = typeof pressCoverages.$inferInsert;
export type PressCoverageStatus =
  (typeof pressCoverageStatusEnum.enumValues)[number];
