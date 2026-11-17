import 'server-only';

import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  activationPilotAssignments,
  activationPilotDecisions,
  activationPilotExposures,
  activationPilotOutcomes,
} from '@/lib/db/schema/activation-pilot';
import { captureError } from '@/lib/error-tracking';
import { stableSerialize } from '@/lib/stable-serialize';
import type {
  ActivationExperimentSpec,
  AssignmentRecord,
  DecisionWriteback,
  EvaluationInput,
  ExposureRecord,
  OutcomeRecord,
} from './pilot-controller';
import { buildAssignment, evaluatePilot } from './pilot-controller';

/**
 * Server-side persistence for the activation pilot loop (JOV-6468).
 *
 * Assignment, exposure, outcome and decision writebacks are recorded here so
 * the loop's evidence survives rerender/restart and a later eligible decision
 * consumes recorded history. Storage never recomputes the experiment: the
 * pure controller owns assignment math and evaluation, and every write is
 * idempotent so replaying a day's events cannot double-count. Rows are
 * append-only — rollback preserves assignment/exposure/outcome/audit history
 * per the frozen spec.
 *
 * Recording rows is instrumentation, NOT authorization: live customer
 * exposure still requires the certified controls and approvals that already
 * govern the surface.
 */

function iso(value: Date): string {
  return value.toISOString();
}

function writebackDigest(wb: DecisionWriteback): string {
  return createHash('sha256').update(stableSerialize(wb)).digest('hex');
}

function toAssignmentRecord(
  row: typeof activationPilotAssignments.$inferSelect
): AssignmentRecord {
  return {
    experimentId: row.experimentId,
    unitId: row.unitId,
    arm: row.arm as AssignmentRecord['arm'],
    generation: row.generation,
    selectionProbability: row.selectionProbability,
    assignedAtIso: iso(row.assignedAt),
  };
}

/**
 * Sticky assignment: the earliest-generation row for a unit is its
 * assignment forever, so rerender/restart cannot re-randomize. `generation`
 * (default 1) only applies when creating a NEW unit's row; a deliberate
 * re-randomization is a controller-level act (new experiment generation),
 * never a parameter of this store.
 */
export async function ensureAssignment(
  spec: ActivationExperimentSpec,
  unitId: string,
  options: { readonly generation?: number; readonly assignedAtIso: string }
): Promise<AssignmentRecord> {
  const generation = options.generation ?? 1;
  const existing = await db
    .select()
    .from(activationPilotAssignments)
    .where(
      and(
        eq(activationPilotAssignments.experimentId, spec.experimentId),
        eq(activationPilotAssignments.unitId, unitId)
      )
    )
    .orderBy(asc(activationPilotAssignments.generation))
    .limit(1);
  if (existing[0]) return toAssignmentRecord(existing[0]);
  const record = buildAssignment(
    spec,
    unitId,
    generation,
    options.assignedAtIso
  );
  const inserted = await db
    .insert(activationPilotAssignments)
    .values({
      experimentId: record.experimentId,
      unitId: record.unitId,
      arm: record.arm,
      generation: record.generation,
      selectionProbability: record.selectionProbability,
      assignedAt: new Date(record.assignedAtIso),
    })
    .onConflictDoNothing({
      target: [
        activationPilotAssignments.experimentId,
        activationPilotAssignments.unitId,
        activationPilotAssignments.generation,
      ],
    })
    .returning();
  if (inserted[0]) return toAssignmentRecord(inserted[0]);
  // Lost a concurrent insert — the persisted winner is sticky, not ours.
  const winner = await db
    .select()
    .from(activationPilotAssignments)
    .where(
      and(
        eq(activationPilotAssignments.experimentId, spec.experimentId),
        eq(activationPilotAssignments.unitId, unitId)
      )
    )
    .orderBy(asc(activationPilotAssignments.generation))
    .limit(1);
  if (!winner[0]) {
    throw new Error(
      `activation-pilot: assignment for ${unitId} vanished after conflict`
    );
  }
  return toAssignmentRecord(winner[0]);
}

export type RecordExposureResult =
  | { readonly ok: true; readonly exposure: ExposureRecord }
  | { readonly ok: false; readonly reason: string };

/**
 * Log ACTUAL exposure, separately from assignment. Idempotent per unit (the
 * first exposure wins); refuses an exposure that does not match the sticky
 * assignment's arm, or one with no assignment at all.
 */
export async function recordExposure(
  spec: ActivationExperimentSpec,
  unitId: string,
  exposedAtIso: string
): Promise<RecordExposureResult> {
  let assignment: AssignmentRecord | undefined;
  try {
    assignment = await ensureAssignment(spec, unitId, {
      assignedAtIso: exposedAtIso,
    });
  } catch (error) {
    await captureError('activation-pilot: exposure without assignment', error, {
      experimentId: spec.experimentId,
      unitId,
    });
    return { ok: false, reason: 'unassigned' };
  }
  // Idempotent: an already-logged exposure is returned as-is — unless its
  // arm disagrees with the sticky assignment, which is telemetry corruption.
  const existingRows = await db
    .select()
    .from(activationPilotExposures)
    .where(
      and(
        eq(activationPilotExposures.experimentId, spec.experimentId),
        eq(activationPilotExposures.unitId, unitId)
      )
    )
    .limit(1);
  if (existingRows[0]) {
    if (existingRows[0].arm !== assignment.arm) {
      return { ok: false, reason: 'arm-mismatch' };
    }
    return {
      ok: true,
      exposure: {
        experimentId: spec.experimentId,
        unitId,
        arm: assignment.arm,
        surfaceVersion: existingRows[0].surfaceVersion,
        exposedAtIso: iso(existingRows[0].exposedAt),
      },
    };
  }
  const inserted = await db
    .insert(activationPilotExposures)
    .values({
      experimentId: spec.experimentId,
      unitId,
      arm: assignment.arm,
      surfaceVersion: spec.surface.version,
      exposedAt: new Date(exposedAtIso),
    })
    .onConflictDoNothing({
      target: [
        activationPilotExposures.experimentId,
        activationPilotExposures.unitId,
      ],
    })
    .returning();
  if (!inserted[0]) {
    // Lost a concurrent insert; the winner is authoritative.
    const winner = await db
      .select()
      .from(activationPilotExposures)
      .where(
        and(
          eq(activationPilotExposures.experimentId, spec.experimentId),
          eq(activationPilotExposures.unitId, unitId)
        )
      )
      .limit(1);
    if (!winner[0] || winner[0].arm !== assignment.arm) {
      return { ok: false, reason: 'arm-mismatch' };
    }
    return {
      ok: true,
      exposure: {
        experimentId: spec.experimentId,
        unitId,
        arm: assignment.arm,
        surfaceVersion: winner[0].surfaceVersion,
        exposedAtIso: iso(winner[0].exposedAt),
      },
    };
  }
  return {
    ok: true,
    exposure: {
      experimentId: spec.experimentId,
      unitId,
      arm: assignment.arm,
      surfaceVersion: inserted[0].surfaceVersion,
      exposedAtIso: iso(inserted[0].exposedAt),
    },
  };
}

/**
 * Record an outcome event. Idempotent per (unit, event): a duplicate
 * conversion lands once, mirroring the controller's dedupe.
 */
export async function recordOutcome(
  spec: ActivationExperimentSpec,
  unitId: string,
  event: string,
  occurredAtIso: string
): Promise<{ readonly ok: true; readonly deduped: boolean }> {
  const inserted = await db
    .insert(activationPilotOutcomes)
    .values({
      experimentId: spec.experimentId,
      unitId,
      event,
      occurredAt: new Date(occurredAtIso),
    })
    .onConflictDoNothing({
      target: [
        activationPilotOutcomes.experimentId,
        activationPilotOutcomes.unitId,
        activationPilotOutcomes.event,
      ],
    })
    .returning();
  return { ok: true, deduped: inserted.length === 0 };
}

async function loadEvaluationInputs(
  spec: ActivationExperimentSpec,
  options: {
    readonly approvedSpecDigest: string;
    readonly consentWithdrawn?: readonly string[];
    readonly guardrailObservations?: Record<string, number>;
    readonly nowIso: string;
  }
): Promise<EvaluationInput> {
  const [assignments, exposures, outcomes] = await Promise.all([
    db
      .select()
      .from(activationPilotAssignments)
      .where(eq(activationPilotAssignments.experimentId, spec.experimentId))
      // Earliest generation first: the sticky assignment wins in the
      // controller's first-row-per-unit dedupe regardless of insert order.
      .orderBy(asc(activationPilotAssignments.generation)),
    db
      .select()
      .from(activationPilotExposures)
      .where(eq(activationPilotExposures.experimentId, spec.experimentId)),
    db
      .select()
      .from(activationPilotOutcomes)
      .where(eq(activationPilotOutcomes.experimentId, spec.experimentId)),
  ]);
  const records: {
    assignments: AssignmentRecord[];
    exposures: ExposureRecord[];
    outcomes: OutcomeRecord[];
  } = {
    assignments: assignments.map(row => ({
      experimentId: row.experimentId,
      unitId: row.unitId,
      arm: row.arm as AssignmentRecord['arm'],
      generation: row.generation,
      selectionProbability: row.selectionProbability,
      assignedAtIso: iso(row.assignedAt),
    })),
    exposures: exposures.map(row => ({
      experimentId: row.experimentId,
      unitId: row.unitId,
      arm: row.arm as ExposureRecord['arm'],
      surfaceVersion: row.surfaceVersion,
      exposedAtIso: iso(row.exposedAt),
    })),
    outcomes: outcomes.map(row => ({
      unitId: row.unitId,
      event: row.event,
      occurredAtIso: iso(row.occurredAt),
    })),
  };
  return {
    spec,
    approvedSpecDigest: options.approvedSpecDigest,
    ...records,
    consentWithdrawn: options.consentWithdrawn,
    guardrailObservations: options.guardrailObservations,
    nowIso: options.nowIso,
  };
}

/**
 * Evaluate the pilot from persisted history and append the resulting
 * writeback. The writeback (decision, reason, policy version, spec digest,
 * exact evidence) is the record a subsequent eligible decision consumes.
 */
export async function evaluateAndWriteback(options: {
  readonly spec: ActivationExperimentSpec;
  readonly approvedSpecDigest: string;
  readonly consentWithdrawn?: readonly string[];
  readonly guardrailObservations?: Record<string, number>;
  readonly nowIso: string;
}): Promise<DecisionWriteback> {
  const input = await loadEvaluationInputs(options.spec, options);
  const wb = evaluatePilot(input);
  await db.insert(activationPilotDecisions).values({
    experimentId: wb.experimentId,
    decision: wb.decision,
    reason: wb.reason,
    policyVersion: wb.policyVersion,
    specDigest: wb.specDigest,
    writebackDigest: writebackDigest(wb),
    evidence: wb.evidence as unknown as Record<string, unknown>,
    decidedAt: new Date(wb.decidedAtIso),
  });
  return wb;
}

/**
 * Newest persisted writeback for an experiment, or null before the first
 * evaluation. Consumers (nextServingPolicy / product-bet review) read this
 * instead of recomputing.
 */
export async function latestPilotDecision(
  experimentId: string
): Promise<DecisionWriteback | null> {
  const rows = await db
    .select()
    .from(activationPilotDecisions)
    .where(eq(activationPilotDecisions.experimentId, experimentId))
    .orderBy(desc(activationPilotDecisions.decidedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    contract: 'jovie.activation-decision-writeback/v1',
    experimentId: row.experimentId,
    decision: row.decision as DecisionWriteback['decision'],
    reason: row.reason,
    policyVersion: row.policyVersion,
    specDigest: row.specDigest,
    evidence: row.evidence as unknown as DecisionWriteback['evidence'],
    decidedAtIso: iso(row.decidedAt),
  };
}
