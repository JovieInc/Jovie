import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Runtime persistence for the bounded activation pilot (JOV-6468).
 *
 * The pure controller (`lib/activation/pilot-controller.ts`) defines the
 * frozen spec, sticky assignment math, evaluation and writeback; these tables
 * are where the loop's evidence actually lands so a later decision consumes
 * recorded history instead of in-memory state. Append-only by design: rows
 * are never updated or deleted by app code, so rollback preserves
 * assignments/exposures/outcomes/audit history.
 *
 * Write paths live in `lib/activation/pilot-store.server.ts`. Live customer
 * exposure is NOT authorized by this schema alone — it records whatever the
 * certified control path actually served.
 */

/** One persisted baseline-funnel stage with its exact denominator. */
export interface ActivationPilotBaselineStage {
  /** Funnel stage name (e.g. proof_viewed, claim_started, activation). */
  readonly stage: string;
  /** Observed count; `null` means the source is missing/unknown — never 0. */
  readonly count: number | null;
  /** Denominator the count is measured against (e.g. eligible units). */
  readonly denominator: number | null;
  /** 'fresh' when the source answered in-window, 'unknown' otherwise. */
  readonly freshness: 'fresh' | 'stale' | 'unknown';
  /** Where the count came from (e.g. redis counter key or DB query). */
  readonly sourceRef: string;
}

/** The newest writeback row for an experiment is the one consumers read. */
export const activationPilotAssignments = pgTable(
  'activation_pilot_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: text('experiment_id').notNull(),
    unitId: text('unit_id').notNull(),
    arm: text('arm').notNull(),
    generation: integer('generation').notNull(),
    selectionProbability: real('selection_probability').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    // Sticky: the lowest-generation row for a unit is its assignment forever.
    unitGenerationUidx: uniqueIndex(
      'activation_pilot_assignments_unit_generation_uidx'
    ).on(table.experimentId, table.unitId, table.generation),
    unitIdx: index('activation_pilot_assignments_unit_idx').on(
      table.experimentId,
      table.unitId
    ),
    armIdx: index('activation_pilot_assignments_arm_idx').on(
      table.experimentId,
      table.arm
    ),
  })
);

/**
 * Actual exposure, logged separately from assignment (assignment ≠ exposure).
 * One row per unit: the first served exposure wins and duplicates are no-ops,
 * so exposed-only diagnostics can never double-count a unit.
 */
export const activationPilotExposures = pgTable(
  'activation_pilot_exposures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: text('experiment_id').notNull(),
    unitId: text('unit_id').notNull(),
    arm: text('arm').notNull(),
    surfaceVersion: text('surface_version').notNull(),
    exposedAt: timestamp('exposed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    // First exposure wins; rerenders/restarts cannot create a second one.
    unitUidx: uniqueIndex('activation_pilot_exposures_unit_uidx').on(
      table.experimentId,
      table.unitId
    ),
    armIdx: index('activation_pilot_exposures_arm_idx').on(
      table.experimentId,
      table.arm
    ),
  })
);

/** Primary (and downstream) outcome events, deduped per unit + event. */
export const activationPilotOutcomes = pgTable(
  'activation_pilot_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: text('experiment_id').notNull(),
    unitId: text('unit_id').notNull(),
    event: text('event').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    // A duplicate conversion event counts once at the storage layer too.
    unitEventUidx: uniqueIndex('activation_pilot_outcomes_unit_event_uidx').on(
      table.experimentId,
      table.unitId,
      table.event
    ),
    eventIdx: index('activation_pilot_outcomes_event_idx').on(
      table.experimentId,
      table.event
    ),
  })
);

/**
 * Append-only evaluated-decision history. One row per `evaluatePilot`
 * writeback with its exact evidence and policy version; consumers read the
 * newest row (see `latestPilotDecision`) so the subsequent eligible decision
 * consumes recorded history.
 */
export const activationPilotDecisions = pgTable(
  'activation_pilot_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: text('experiment_id').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    policyVersion: text('policy_version').notNull(),
    specDigest: text('spec_digest').notNull(),
    writebackDigest: text('writeback_digest').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    experimentIdx: index('activation_pilot_decisions_experiment_idx').on(
      table.experimentId,
      table.decidedAt
    ),
  })
);

/**
 * Persisted baseline-funnel snapshots: exact eligible population/denominator,
 * per-stage counts and source freshness for the cohort under test. Missing
 * telemetry is recorded as `null` counts with freshness 'unknown' — unknown
 * is never written as zero.
 */
export const activationPilotBaselineSnapshots = pgTable(
  'activation_pilot_baseline_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: text('experiment_id').notNull(),
    cohortId: text('cohort_id').notNull(),
    /** Named source of the snapshot (e.g. proof-claim funnel report). */
    sourceRef: text('source_ref').notNull(),
    /** Eligible population for the declared cohort; null = unknown. */
    eligiblePopulation: integer('eligible_population'),
    stages: jsonb('stages')
      .$type<readonly ActivationPilotBaselineStage[]>()
      .notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    experimentIdx: index('activation_pilot_baseline_experiment_idx').on(
      table.experimentId,
      table.capturedAt
    ),
  })
);

export type ActivationPilotAssignmentRow =
  typeof activationPilotAssignments.$inferSelect;
export type ActivationPilotExposureRow =
  typeof activationPilotExposures.$inferSelect;
export type ActivationPilotOutcomeRow =
  typeof activationPilotOutcomes.$inferSelect;
export type ActivationPilotDecisionRow =
  typeof activationPilotDecisions.$inferSelect;
export type ActivationPilotBaselineSnapshotRow =
  typeof activationPilotBaselineSnapshots.$inferSelect;
