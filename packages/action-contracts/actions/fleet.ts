import { z } from 'zod';
import type { ActionDescriptor } from '../descriptor';

export const FLEET_ACTION_IDS = [
  'fleet.register',
  'fleet.status',
  'work.next',
  'work.claim',
  'work.report',
  'defect.report',
] as const;
export type FleetActionId = (typeof FLEET_ACTION_IDS)[number];
export const FLEET_SCOPES = [
  'fleet:register',
  'fleet:read',
  'work:next',
  'work:claim',
  'work:report',
  'defect:report',
] as const;
export const fleetScopeSchema = z.enum(FLEET_SCOPES);
export const workerIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const label = z.string().trim().min(1).max(100);
export const fleetRegistrationSchema = z
  .object({
    workerId: workerIdSchema,
    runtimeClass: label,
    capabilities: z.array(label).max(32),
    tools: z.array(label).max(32),
    connectors: z.array(label).max(32),
    availability: z.enum(['available', 'busy', 'offline']),
    specialization: label.optional(),
  })
  .strict();
export const fleetWorkerSchema = fleetRegistrationSchema.extend({
  scopes: z.array(fleetScopeSchema),
  registeredAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revoked: z.boolean(),
});
export const fleetEvidenceSchema = z
  .object({
    ref: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(1000),
  })
  .strict();
export const fleetMissionSchema = z
  .object({
    missionId: z.uuid(),
    issueId: z.string().regex(/^JOV-[1-9][0-9]*$/),
    title: z.string().trim().min(1).max(200),
    acceptanceCriteria: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(10),
    owner: label,
    existingWorkRefs: z.array(z.string().min(1).max(500)).max(10),
    // First canary only admits existing anonymous product reads. A lease never
    // confers write, spend, legal or destructive authority.
    command: z.enum(['artist.get', 'artist.llms', 'api.openapi', 'docs.llms']),
    argument: label.optional(),
    requiredTools: z.array(label).max(32),
    requiredConnectors: z.array(label).max(32),
    targetWorkerId: workerIdSchema.optional(),
    maxDurationSeconds: z.number().int().min(30).max(3600),
    notAfter: z.iso.datetime(),
    founderIntentRef: z.string().min(1).max(500),
  })
  .strict();
export const fleetLeaseSchema = z.object({
  leaseId: z.uuid(),
  workerId: workerIdSchema,
  mission: fleetMissionSchema,
  state: z.enum(['offered', 'claimed', 'reported']),
  offeredAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  claimedAt: z.iso.datetime().optional(),
});
export const fleetReportInputSchema = z
  .object({
    leaseId: z.uuid(),
    outcome: z.enum(['completed', 'failed', 'blocked']),
    summary: z.string().trim().min(1).max(2000),
    evidence: z.array(fleetEvidenceSchema).min(1).max(10),
  })
  .strict();
export const fleetTerminalReceiptSchema = fleetReportInputSchema.extend({
  receiptId: z.uuid(),
  workerId: workerIdSchema,
  missionId: z.uuid(),
  reportedAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative(),
});
export const fleetDefectInputSchema = z
  .object({
    leaseId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    command: label,
    apiCode: label,
    details: z.string().trim().min(1).max(4000),
    evidence: z.array(fleetEvidenceSchema).min(1).max(10),
  })
  .strict();
const output = {
  'fleet.register': z.object({ worker: fleetWorkerSchema }),
  'fleet.status': z.object({
    worker: fleetWorkerSchema,
    lease: fleetLeaseSchema.nullable(),
    receipts: z.array(fleetTerminalReceiptSchema),
  }),
  'work.next': z.object({ lease: fleetLeaseSchema.nullable() }),
  'work.claim': z.object({ lease: fleetLeaseSchema }),
  'work.report': z.object({ receipt: fleetTerminalReceiptSchema }),
  'defect.report': z.object({
    issueId: z.uuid(),
    identifier: z.string().min(1),
    url: z.url(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }),
};
export const FLEET_INPUT_SCHEMAS = {
  'fleet.register': fleetRegistrationSchema,
  'fleet.status': z.object({}).strict(),
  'work.next': z.object({}).strict(),
  'work.claim': z.object({ leaseId: z.uuid() }).strict(),
  'work.report': fleetReportInputSchema,
  'defect.report': fleetDefectInputSchema,
};
export const FLEET_ACTIONS: readonly ActionDescriptor[] = FLEET_ACTION_IDS.map(
  (id, index) => ({
    id,
    schemaVersion: 1,
    titleKey: `actions.${id}.title`,
    descriptionKey: `actions.${id}.description`,
    effect: id === 'defect.report' ? 'external_write' : 'internal_write',
    confirmation: 'none',
    supportedChannels: ['cli', 'mcp'],
    requirements: [
      { type: 'auth' },
      { type: 'profile_ownership' },
      { type: 'worker_scope', key: FLEET_SCOPES[index] },
    ],
    inputSchema: FLEET_INPUT_SCHEMAS[id],
    outputSchema: output[id],
  })
);
