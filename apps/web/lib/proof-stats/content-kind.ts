import { z } from 'zod';
import type { ContentKindDefinition } from '@/lib/content-records/kind';
import { getProofStat } from './registry';

export const PROOF_STATS_KIND_ID = 'proof-stats';
export const PROOF_STATS_KEY = 'observations';
const isoDate = z.string().datetime({ offset: true });
export const proofStatObservationSchema = z
  .object({
    value: z.number().finite().min(0),
    measuredAt: isoDate,
    source: z.string().regex(/^[a-z][a-z0-9-]*:[A-Za-z0-9._/-]+$/u),
    receipt: z.string().max(512).nullable().optional(),
    approval: z
      .object({ cardId: z.string().min(4).max(128), approvedAt: isoDate })
      .strict()
      .nullable()
      .optional(),
    /** Comparative stats: every measured entrant, for the ranked chart. */
    breakdown: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(60),
            value: z.number().finite().min(0),
            self: z.boolean(),
          })
          .strict()
      )
      .max(12)
      .optional(),
  })
  .strict();
export const PROOF_STATS_EVENT_LIMIT = 50;
export const proofStatEventSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_:.-]{8,160}$/u),
    type: z.enum(['milestone', 'published', 'withdrawn']),
    statId: z.string(),
    value: z.number().finite(),
    reason: z.string().max(40).nullable(),
    at: isoDate,
  })
  .strict();
export type ProofStatEvent = z.infer<typeof proofStatEventSchema>;
export const proofStatsRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    observations: z.record(z.string(), proofStatObservationSchema),
    /** A state change publishes a version and invalidates the shared cache tag. */
    publishable: z.array(z.string()).default([]),
    events: z
      .array(proofStatEventSchema)
      .max(PROOF_STATS_EVENT_LIMIT)
      .default([]),
  })
  .strict();
export type ProofStatsRecord = z.infer<typeof proofStatsRecordSchema>;
export function validateProofStatsRecord(data: ProofStatsRecord): string[] {
  const errors: string[] = [];
  for (const [id, observation] of Object.entries(data.observations)) {
    const stat = getProofStat(id);
    if (!stat) {
      errors.push(`observations.${id}: not in the proof-stat registry`);
      continue;
    }
    if (stat.unit === 'ratio' && observation.value > 1) {
      errors.push(`observations.${id}: a ratio must be between 0 and 1`);
    }
    if (
      observation.breakdown &&
      observation.breakdown.filter(entry => entry.self).length !== 1
    ) {
      errors.push(
        `observations.${id}: a breakdown has exactly one Jovie entry`
      );
    }
    if (stat.legalClass === 'plain' && observation.approval) {
      errors.push(
        `observations.${id}: plain claims carry no approval; only comparative and health claims do`
      );
    }
  }
  return errors;
}
export const PROOF_STATS_KIND: ContentKindDefinition<ProofStatsRecord> = {
  kind: PROOF_STATS_KIND_ID,
  schemaVersion: 1,
  schema: proofStatsRecordSchema,
  keys: [PROOF_STATS_KEY],
  defaultRecord: () => ({
    schemaVersion: 1,
    observations: {},
    publishable: [],
    events: [],
  }),
  validate: data => validateProofStatsRecord(data),
  livePaths: () => [],
  apiWritable: false,
};
