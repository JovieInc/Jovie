import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
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
import { users } from './auth';
import { creatorProfiles } from './profiles';

/**
 * Cohort tags for artist revenue-lift measurement (IRPAA foundation,
 * JovieInc/Jovie#12141 under EPIC #12139).
 *
 * - `jovie_active`: artist who shipped ≥1 Jovie automation (a completed
 *   `workflow_runs` row with a `workflow_run_outcomes` snapshot).
 * - `control`: matched artist (similar catalog size / genre) with a profile
 *   but no shipped automations.
 */
export const ARTIST_REVENUE_COHORTS = ['jovie_active', 'control'] as const;
export type ArtistRevenueCohort = (typeof ARTIST_REVENUE_COHORTS)[number];

/**
 * Criteria snapshotted at assignment time so control matching is auditable.
 * Stored as JSONB — matching is offline/heuristic, never a hot-path query.
 */
export interface ArtistCohortMatchCriteria {
  /** Number of catalog releases at assignment time, when known. */
  readonly catalogSize?: number;
  /** Genre tags from `creator_profiles.genres` at assignment time. */
  readonly genres?: readonly string[];
  /** Spotify follower count at assignment time, when known. */
  readonly spotifyFollowers?: number;
  /** For control members: the jovie_active user this artist is matched to. */
  readonly matchedToUserId?: string;
}

/**
 * Cohort assignment + immutable pre-Jovie revenue baseline, one row per
 * artist. The baseline is snapshotted once at assignment (30 days preceding
 * activation/assignment) and never recomputed — rolling lift is
 * `signal(window) − baseline` computed by `lib/metrics/artist-revenue-cohorts.ts`.
 *
 * Cohort is text + CHECK (not a pg enum) so future cohorts don't require an
 * enum migration — same tradeoff as `workflow_runs.kind`.
 */
export const artistRevenueCohorts = pgTable(
  'artist_revenue_cohorts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),
    cohort: text('cohort').notNull(),
    /** When the cohort tag was assigned. */
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * jovie_active only: when the artist shipped their first automation.
     * The baseline window ends here (or at assignedAt for control members).
     */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    matchCriteria: jsonb('match_criteria')
      .$type<ArtistCohortMatchCriteria>()
      .notNull()
      .default({}),

    // --- Immutable 30-day pre-Jovie baseline snapshot ---
    baselineWindowStart: timestamp('baseline_window_start', {
      withTimezone: true,
    }).notNull(),
    baselineWindowEnd: timestamp('baseline_window_end', {
      withTimezone: true,
    }).notNull(),
    /** Real merch GMV (countable-status order subtotals) in the baseline window. */
    baselineGmvCents: integer('baseline_gmv_cents').notNull().default(0),
    /** Completed tip revenue in the baseline window (real revenue). */
    baselineTipsCents: integer('baseline_tips_cents').notNull().default(0),
    /** Non-bot `listen` clicks in the baseline window. */
    baselineDspClickCount: integer('baseline_dsp_click_count')
      .notNull()
      .default(0),
    /** Captured fans (email/phone) first seen in the baseline window. */
    baselineNewFanCount: integer('baseline_new_fan_count').notNull().default(0),
    /** Dollarized baseline signal (weights applied at capture time). */
    baselineRevenueSignalCents: integer('baseline_revenue_signal_cents')
      .notNull()
      .default(0),
    /** `REVENUE_LIFT_WEIGHTS_VERSION` used to dollarize the baseline. */
    baselineWeightsVersion: text('baseline_weights_version').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('artist_revenue_cohorts_user_id_uniq').on(table.userId),
    index('artist_revenue_cohorts_cohort_assigned_at_idx').on(
      table.cohort,
      table.assignedAt
    ),
    index('artist_revenue_cohorts_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    check(
      'artist_revenue_cohorts_cohort_check',
      drizzleSql`${table.cohort} IN ('jovie_active', 'control')`
    ),
  ]
);

export type ArtistRevenueCohortRow = typeof artistRevenueCohorts.$inferSelect;
export type NewArtistRevenueCohortRow =
  typeof artistRevenueCohorts.$inferInsert;
export const insertArtistRevenueCohortSchema =
  createInsertSchema(artistRevenueCohorts);
export const selectArtistRevenueCohortSchema =
  createSelectSchema(artistRevenueCohorts);
