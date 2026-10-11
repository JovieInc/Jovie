import { z } from 'zod';
import type { ActionDescriptor } from '../descriptor';

export const FLEET_ACTION_IDS = [
  'fleet.register',
  'fleet.status',
  'work.next',
  'work.claim',
  'work.report',
  'defect.report',
  'fleet.directory',
  'work.request',
] as const;
export type FleetActionId = (typeof FLEET_ACTION_IDS)[number];
export const FLEET_SCOPES = [
  'fleet:register',
  'fleet:read',
  'work:next',
  'work:claim',
  'work:report',
  'defect:report',
  'fleet:discover',
  'work:request',
] as const;
export const fleetScopeSchema = z.enum(FLEET_SCOPES);
export const workerIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const label = z.string().trim().min(1).max(100);
const command = z.enum([
  'artist.get',
  'artist.llms',
  'api.openapi',
  'docs.llms',
]);
const identityRef = z.string().regex(/^urn:[a-z0-9][a-z0-9:._-]{2,180}$/i);
// Only founder provisioning attests these bindings; worker claims never grant
// identity, scopes, visibility or limits. Refs are opaque, not emails/secrets.
export const fleetAuthoritySchema = z
  .object({
    identity: z
      .object({
        provider: label,
        accountRef: identityRef,
        runtimeRef: identityRef,
        displayName: label,
        role: z.enum(['operator', 'customer']),
        attestationRef: z.string().min(1).max(500),
      })
      .strict(),
    visibility: z.enum(['operators', 'fleet']),
    allowedCommands: z.array(command).min(1).max(4),
    allowedTools: z.array(label).max(32),
    allowedConnectors: z.array(label).max(32),
    maxDurationSeconds: z.number().int().min(30).max(3600),
    maxConcurrentLeases: z.literal(1),
    spendUsd: z.literal(0),
  })
  .strict();
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
  authority: fleetAuthoritySchema.optional(),
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
    command,
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
export const fleetRequestInputSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['help', 'dogfood', 'research']),
    proposal: fleetMissionSchema.omit({
      missionId: true,
      owner: true,
      founderIntentRef: true,
    }),
  })
  .strict();
export const fleetRequestSchema = fleetRequestInputSchema.extend({
  requesterWorkerId: workerIdSchema,
  createdAt: z.iso.datetime(),
  state: z.enum([
    'pending',
    'accepted',
    'rejected',
    'expired',
    'completed',
    'failed',
    'blocked',
    'unavailable',
  ]),
  reason: z
    .enum([
      'capacity',
      'scope',
      'identity',
      'duplicate',
      'unavailable',
      'declined',
    ])
    .optional(),
  receipt: fleetTerminalReceiptSchema.optional(),
});
export const fleetHistoryEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    sequence: z.number().int().positive(),
    kind: z.literal('receipt'),
    receipt: fleetTerminalReceiptSchema,
  }),
  z.object({
    sequence: z.number().int().positive(),
    kind: z.literal('request'),
    request: fleetRequestSchema,
  }),
]);
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
    requests: z.array(fleetRequestSchema).optional(),
    requestsNextCursor: z.uuid().nullable().optional(),
    history: z
      .object({
        entries: z.array(fleetHistoryEntrySchema).max(100),
        nextCursor: z.number().int().positive().nullable(),
        pending: z.boolean().optional(),
      })
      .optional(),
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
  'fleet.directory': z.object({
    workers: z.array(fleetWorkerSchema),
    refreshedAt: z.iso.datetime(),
    limits: z.object({
      maxPendingRequests: z.literal(5),
      maxRequestHorizonSeconds: z.literal(86400),
      heartbeatMaxAgeSeconds: z.literal(300),
    }),
  }),
  'work.request': z.object({ request: fleetRequestSchema }),
};
export const FLEET_INPUT_SCHEMAS = {
  'fleet.register': fleetRegistrationSchema,
  'fleet.status': z
    .object({
      requestsAfter: z.uuid().optional(),
      historyAfter: z
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
      historyLimit: z.number().int().min(1).max(100).optional(),
    })
    .strict(),
  'work.next': z.object({}).strict(),
  'work.claim': z.object({ leaseId: z.uuid() }).strict(),
  'work.report': fleetReportInputSchema,
  'defect.report': fleetDefectInputSchema,
  'fleet.directory': z.object({}).strict(),
  'work.request': fleetRequestInputSchema,
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
