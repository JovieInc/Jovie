import { z } from 'zod';
import { FLEET_ACTION_IDS } from './actions/fleet';

import type { ActionId } from './ids';
import { ACTION_CHANNELS } from './invocation';

/**
 * Capability completeness contract (JOV-5946 founder invariant).
 *
 * Products must be complete for the jobs they promise, but no surface is
 * entitled to exist. A capability declares its promised outcome and the
 * jobs a user or agent must be able to finish end to end; each job is
 * certified on one or more surfaces. A capability cannot be certified
 * while a critical required, recovery, or trust job has no certified
 * path — regardless of how polished the existing surfaces are.
 *
 * Contracts bind to the canonical action registry by `ActionId` via
 * `CAPABILITY_COMPLETENESS`; this is an overlay on registered identity,
 * not a second registry. Capabilities that predate an action ID (pilots)
 * may declare a contract with a non-action `capabilityId`.
 */

/**
 * Surfaces are adapters over canonical actions/state. The vocabulary
 * extends `ActionChannel` with transport-level and public surfaces that
 * are not client channels: `api`, `webhook`, and `public_channel`
 * (resolved-identity social mention/DM). No surface may implement a
 * private second version of the capability.
 */
export const CAPABILITY_SURFACES = [
  ...ACTION_CHANNELS,
  'api',
  'webhook',
  'public_channel',
] as const;

export type CapabilitySurface = (typeof CAPABILITY_SURFACES)[number];

export const capabilitySurfaceSchema = z.enum(CAPABILITY_SURFACES);

/** Agent- and machine-first surfaces that require no GUI. */
export const AGENT_FIRST_SURFACES = [
  'api',
  'webhook',
  'mcp',
  'cli',
  'chat_tool',
] as const satisfies readonly CapabilitySurface[];

export const CAPABILITY_JOB_KINDS = [
  'required',
  'prerequisite',
  'recovery',
  'trust',
  'regulatory',
] as const;

export type CapabilityJobKind = (typeof CAPABILITY_JOB_KINDS)[number];

export const CAPABILITY_JOB_STATES = ['certified', 'missing'] as const;

export type CapabilityJobState = (typeof CAPABILITY_JOB_STATES)[number];

/**
 * Recorded gap for a job without a certified path. Emits one deduplicated
 * remediation case (Ovi/Linear) via the coverage-evidence lifecycle.
 */
export const capabilityGapSchema = z.object({
  affectedUsers: z.string().min(1),
  workaround: z.string().min(1),
  owner: z.string().min(1),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']),
  /** Gaps are time-boxed; an expired gap is a ratchet regression. */
  expiresAt: z.iso.datetime().optional(),
  linearRef: z.string().min(1).optional(),
});

export type CapabilityGap = z.infer<typeof capabilityGapSchema>;

/**
 * One job the capability promises. `surfaces` lists the surfaces on which
 * the job has a certified end-to-end path; `evidence` is the proof a real
 * user or agent finished the job (not merely that an API exists), and
 * records why the admitted surfaces earned their place.
 */
export const capabilityJobSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'expected kebab-case job id'),
    kind: z.enum(CAPABILITY_JOB_KINDS),
    /**
     * Critical jobs block certification when missing. Required, recovery,
     * and trust jobs default to critical; prerequisites and regulatory
     * jobs declare explicitly.
     */
    critical: z.boolean(),
    state: z.enum(CAPABILITY_JOB_STATES),
    surfaces: z.array(capabilitySurfaceSchema),
    evidence: z.string().min(1),
    gap: capabilityGapSchema.optional(),
    /** Explicitly admitted: no planned surface, by decision not neglect. */
    noSurfacePlanned: z.boolean().optional(),
  })
  .superRefine((job, ctx) => {
    if (job.state === 'certified' && job.surfaces.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'a certified job must name at least one certified surface',
        path: ['surfaces'],
      });
    }
    if (job.state === 'missing' && !job.gap && !job.noSurfacePlanned) {
      ctx.addIssue({
        code: 'custom',
        message: 'a missing job must record a gap owner or noSurfacePlanned',
        path: ['gap'],
      });
    }
  });

export type CapabilityJob = z.infer<typeof capabilityJobSchema>;

export const capabilityCompletenessContractSchema = z.object({
  /** For registered capabilities this is the canonical `ActionId`. */
  capabilityId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  /** Target user/agent and the promised outcome. */
  promisedOutcome: z.string().min(1),
  jobs: z.array(capabilityJobSchema).min(1),
  /** Jobs intentionally out of scope; prevents silent completeness drift. */
  nonGoals: z.array(z.string().min(1)),
});

export type CapabilityCompletenessContract = z.infer<
  typeof capabilityCompletenessContractSchema
>;

/** Kinds whose absence blocks certification when critical. */
export const CERTIFICATION_BLOCKING_KINDS = [
  'required',
  'recovery',
  'trust',
] as const satisfies readonly CapabilityJobKind[];

export interface CompletenessEvaluation {
  certified: boolean;
  /** IDs of critical required/recovery/trust jobs with no certified path. */
  blockers: readonly string[];
  /** IDs of non-blocking missing jobs (recorded gaps). */
  gaps: readonly string[];
}

/**
 * A capability is incomplete when a critical required, recovery, or trust
 * job has no certified path — even if every existing surface works.
 */
export function evaluateCompleteness(
  contract: CapabilityCompletenessContract
): CompletenessEvaluation {
  const blockers: string[] = [];
  const gaps: string[] = [];
  for (const job of contract.jobs) {
    if (job.state === 'certified') continue;
    const blocking =
      job.critical &&
      (CERTIFICATION_BLOCKING_KINDS as readonly string[]).includes(job.kind);
    (blocking ? blockers : gaps).push(job.id);
  }
  return { certified: blockers.length === 0, blockers, gaps };
}

const CERTIFIED = 'certified' as const;

/**
 * Completeness contracts for the canonical action registry, keyed by
 * `ActionId`. An overlay on registered identity — adding an action to
 * `ACTION_MANIFEST` without a contract fails the manifest parity test.
 */
export const CAPABILITY_COMPLETENESS: Record<
  ActionId,
  CapabilityCompletenessContract
> = {
  ...(Object.fromEntries(
    FLEET_ACTION_IDS.map(id => [
      id,
      capabilityCompletenessContractSchema.parse({
        capabilityId: id,
        schemaVersion: 1,
        promisedOutcome:
          'A scoped worker coordinates a bounded mission through Summer.',
        jobs: [
          {
            id: 'live-canary',
            kind: 'trust',
            critical: true,
            state: 'missing',
            surfaces: [],
            evidence:
              'Source and local test proof only; deployment, scoped identity provisioning and real Summer canary pending.',
            gap: {
              affectedUsers: 'ChatGPT dots',
              workaround: 'founder dispatch',
              owner: 'Tim White',
              priority: 'p1',
              linearRef: 'JOV-7331',
            },
          },
        ],
        nonGoals: [
          'dot-to-dot chat',
          'write or spend authority from a work lease',
        ],
      }),
    ])
  ) as Record<
    (typeof FLEET_ACTION_IDS)[number],
    CapabilityCompletenessContract
  >),
  'chat.start': capabilityCompletenessContractSchema.parse({
    capabilityId: 'chat.start',
    schemaVersion: 1,
    promisedOutcome:
      'An authenticated creator starts a canonical chat thread from any admitted surface.',
    jobs: [
      {
        id: 'authenticate',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence: 'auth + profile_ownership requirements resolve per channel',
      },
      {
        id: 'invoke',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'app_intent', 'chat_tool', 'mcp', 'cli'],
        evidence: 'canonical invoke route returns a completed receipt',
      },
      {
        id: 'recover-unavailable',
        kind: 'recovery',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence: 'unavailable result carries structured error + handoff',
      },
      {
        id: 'audit-receipt',
        kind: 'trust',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'action_executions ledger records every invocation',
      },
    ],
    nonGoals: ['thread history browsing', 'message editing'],
  }),
  'contact.create': capabilityCompletenessContractSchema.parse({
    capabilityId: 'contact.create',
    schemaVersion: 1,
    promisedOutcome:
      'An authenticated creator adds a contact to their roster from any admitted surface.',
    jobs: [
      {
        id: 'authenticate',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'mcp', 'cli'],
        evidence: 'auth + profile_ownership requirements resolve per channel',
      },
      {
        id: 'invoke',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence: 'canonical invoke route returns a completed receipt',
      },
      {
        id: 'recover-unavailable',
        kind: 'recovery',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence: 'unavailable result carries structured error + handoff',
      },
      {
        id: 'audit-receipt',
        kind: 'trust',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'action_executions ledger records every invocation',
      },
    ],
    nonGoals: ['contact import', 'contact merge'],
  }),
  'release.create': capabilityCompletenessContractSchema.parse({
    capabilityId: 'release.create',
    schemaVersion: 1,
    promisedOutcome:
      'An authenticated creator registers a release from any admitted surface.',
    jobs: [
      {
        id: 'authenticate',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'mcp', 'cli'],
        evidence: 'auth + profile_ownership requirements resolve per channel',
      },
      {
        id: 'invoke',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence: 'canonical invoke route returns a completed receipt',
      },
      {
        id: 'recover-unavailable',
        kind: 'recovery',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence: 'unavailable result carries structured error + handoff',
      },
      {
        id: 'audit-receipt',
        kind: 'trust',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'action_executions ledger records every invocation',
      },
    ],
    nonGoals: ['dsp distribution submission', 'release artwork upload'],
  }),
  'task.create': capabilityCompletenessContractSchema.parse({
    capabilityId: 'task.create',
    schemaVersion: 1,
    promisedOutcome:
      'An authenticated workspace member creates a task from any admitted surface.',
    jobs: [
      {
        id: 'authenticate',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'mcp', 'cli'],
        evidence: 'auth + profile_ownership requirements resolve per channel',
      },
      {
        id: 'invoke',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'app_intent', 'chat_tool', 'mcp', 'cli'],
        evidence: 'canonical invoke route returns a completed receipt',
      },
      {
        id: 'recover-entitlement',
        kind: 'recovery',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
        evidence:
          'canAccessTasksWorkspace denial returns structured unavailable + upgrade handoff',
      },
      {
        id: 'audit-receipt',
        kind: 'trust',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'action_executions ledger records every invocation',
      },
    ],
    nonGoals: ['task bulk import', 'task templates'],
  }),
};

export function getCompletenessContract(
  id: ActionId
): CapabilityCompletenessContract {
  return CAPABILITY_COMPLETENESS[id];
}

/**
 * B2B model-routing pilot job matrix (JOV-5946 audit). Deliberately
 * agent/API-first: no job requires a web dashboard to certify. The single
 * GUI admission — `budget-limits` on `web` — is evidence-backed: budget
 * changes are high-frequency and high-risk, so an explicit control earns
 * its place over asking an agent.
 */
export const MODEL_ROUTER_COMPLETENESS_CONTRACT: CapabilityCompletenessContract =
  capabilityCompletenessContractSchema.parse({
    capabilityId: 'model-router.invoke',
    schemaVersion: 1,
    promisedOutcome:
      'A B2B customer or agent routes model requests through Jovie with observable cost, enforced budgets, and recoverable failures — with no required dashboard.',
    jobs: [
      {
        id: 'authenticate',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'mcp', 'cli'],
        evidence: 'API key auth at the gateway; no account UI needed',
      },
      {
        id: 'install-agent',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['cli', 'mcp'],
        evidence:
          'jovie router install via CLI/MCP; key issued non-interactively',
      },
      {
        id: 'invoke-route',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'mcp', 'cli'],
        evidence: 'POST /v1/route returns routed completion + receipt',
      },
      {
        id: 'request-status',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'cli'],
        evidence: 'GET /v1/requests/{id} returns canonical receipt status',
      },
      {
        id: 'health',
        kind: 'trust',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'unauthenticated /healthz with dependency status',
      },
      {
        id: 'usage-cost',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'cli'],
        evidence:
          'usage endpoint returns per-key cost; agent-first, no dashboard',
      },
      {
        id: 'budget-limits',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['web', 'api', 'cli'],
        evidence:
          'high-frequency + high-risk: explicit web control admitted on evidence; api/cli remain canonical',
      },
      {
        id: 'credential-lifecycle',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'cli'],
        evidence: 'key create/rotate/revoke via api and cli',
      },
      {
        id: 'failure-retry',
        kind: 'recovery',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'idempotency keys + structured retryable error contract',
      },
      {
        id: 'observability',
        kind: 'trust',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'webhook'],
        evidence: 'request logs + webhook delivery receipts',
      },
      {
        id: 'support',
        kind: 'recovery',
        critical: true,
        state: CERTIFIED,
        surfaces: ['chat_tool', 'public_channel'],
        evidence: 'support via conversation and resolved-identity public DM',
      },
      {
        id: 'data-handling',
        kind: 'regulatory',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api'],
        evidence: 'documented retention; no prompt bodies stored by default',
      },
      {
        id: 'account-deletion-export',
        kind: 'regulatory',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'chat_tool'],
        evidence: 'self-serve export + deletion request via api',
      },
      {
        id: 'billing',
        kind: 'required',
        critical: true,
        state: CERTIFIED,
        surfaces: ['api', 'web'],
        evidence: 'metered billing; invoices via api, card update via web',
      },
    ],
    nonGoals: ['model fine-tuning UI', 'prompt playground'],
  });
