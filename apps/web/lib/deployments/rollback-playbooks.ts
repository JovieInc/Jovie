import { z } from 'zod';

/**
 * Rollback / forward-recovery playbook registry (JOV-6060).
 *
 * One typed object per critical release class: the recovery strategy
 * (rollback vs forward-fix vs hold-and-quarantine), the owner, the RTO-ish
 * bound, the supported old/new compatibility window, how pre-deploy artifacts
 * (queued jobs, stale clients, cached data, in-flight provider webhooks) stay
 * interpretable or are safely quarantined/reconciled, the bounded stop path
 * with an observable completion signal, and the proof artifacts that make
 * the drill auditable.
 *
 * This is the single source the certification registry (JOV-5930), the
 * release-lineage ledger `rolled_back` marker (JOV-5934), and the assurance
 * matrix (JOV-6064) consume — do not fork a second rollback playbook silo.
 * Feature-flag kill-switch targeting stays with JOV-6055 and config/env parity
 * with JOV-6053; this registry composes them, it does not absorb them.
 */

export const RELEASE_CLASSES = [
  'web-deploy',
  'schema-migration',
  'data-backfill',
  'queue-job-contract',
  'worker-deploy',
  'client-release',
  'cache-config',
  'feature-flag',
  'webhook-contract',
  'env-config',
] as const;

export type ReleaseClass = (typeof RELEASE_CLASSES)[number];

export const RECOVERY_STRATEGIES = [
  /** Revert to the prior known-good build/schema contract. */
  'rollback',
  /** Ship a corrective release; rollback would corrupt or is impossible. */
  'forward_fix',
  /** Stop exposure, quarantine incompatible artifacts, then reconcile. */
  'hold_and_quarantine',
] as const;

export type RecoveryStrategy = (typeof RECOVERY_STRATEGIES)[number];

export const RELEASE_OWNERS = [
  'engineering',
  'operations',
  'data',
  'mobile',
] as const;

export const PRE_DEPLOY_ARTIFACTS = [
  'queued-jobs',
  'in-flight-requests',
  'stale-web-clients',
  'stale-native-clients',
  'cached-assets',
  'cached-data',
  'provider-webhooks',
  'long-lived-connections',
] as const;

export const ARTIFACT_HANDLINGS = [
  /** Old artifacts remain interpretable under the new contract. */
  'interpretable',
  /** Old artifacts are parked aside until explicitly reconciled. */
  'quarantined',
  /** Old artifacts are actively rewritten/drained into the new contract. */
  'reconciled',
] as const;

export const EVIDENCE_CHANNELS = [
  /** Exact-SHA release lineage ledger; `rolled_back` must be durable and queryable (JOV-5934). */
  'release-lineage',
  /** Certification registry evidence object (JOV-5930). */
  'certification-registry',
  /** Incident report / postmortem. */
  'incident-report',
] as const;

const PLAYBOOK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const RollbackPlaybookSchema = z
  .object({
    /** Stable id; used in evidence joins and the assurance matrix. */
    id: z.string().regex(PLAYBOOK_ID_PATTERN),
    /** Human name of the release class. */
    title: z.string().trim().min(1),
    releaseClass: z.enum(RELEASE_CLASSES),
    /**
     * The declared recovery strategy. Every critical release class must have
     * exactly one documented answer — not "depends".
     */
    strategy: z.enum(RECOVERY_STRATEGIES),
    owner: z.enum(RELEASE_OWNERS),
    /**
     * RTO-ish bound: minutes from "decide to recover" to "recovery observed
     * complete". Not a strict SLA — the bound the drill is timed against.
     */
    rtoMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    /**
     * The supported old/new compatibility window this release class must
     * survive — how many prior contract versions pre-deploy artifacts may
     * have been written under.
     */
    compatibilityWindow: z
      .object({
        /** Prior contract versions the new release must still interpret. */
        priorVersions: z.number().int().min(0),
        /** How the window is enforced in practice. */
        enforcement: z.string().trim().min(1),
      })
      .strict(),
    /**
     * For every pre-deploy artifact class in scope, whether it stays
     * interpretable across the deploy boundary or is quarantined/reconciled.
     */
    preDeployArtifacts: z
      .array(
        z
          .object({
            artifact: z.enum(PRE_DEPLOY_ARTIFACTS),
            handling: z.enum(ARTIFACT_HANDLINGS),
            /** Concrete mechanism (reader accepts both shapes, versioned payload, drain job…). */
            mechanism: z.string().trim().min(1),
          })
          .strict()
      )
      .min(1),
    /**
     * True when the release performs an operation that cannot be undone by
     * redeploying old code (destructive migration, irreversible backfill,
     * client store-version bump). Requires an explicit recoveryGate.
     */
    irreversible: z.boolean(),
    /**
     * Required iff irreversible. The explicit migration/recovery gate that
     * must pass before the operation runs.
     */
    recoveryGate: z
      .object({
        /** The gate that authorizes the irreversible step. */
        gate: z.string().trim().min(1),
        /** How we get data back if the operation misfires. */
        recoveryPath: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    /**
     * The bounded stop/rollback path deploy tooling exposes and the signal
     * that proves completion — an operator must be able to observe done-ness.
     */
    boundedStop: z
      .object({
        /** The control that halts exposure (promote-previous, hold gate, flag off). */
        mechanism: z.string().trim().min(1),
        /** The observable signal that the stop actually completed. */
        completionSignal: z.string().trim().min(1),
      })
      .strict(),
    /** P0 journey ids (from lib/observability/p0-journey-slos) the rollback drill must re-verify. */
    drillJourneys: z.array(z.string().regex(PLAYBOOK_ID_PATTERN)).min(1),
    /** Drill cadence in days. */
    drillCadenceDays: z.number().int().min(1).max(365),
    /** Where the recovery evidence lands so `rolled_back` is durable and queryable. */
    evidenceChannels: z.array(z.enum(EVIDENCE_CHANNELS)).min(1),
    /** Concrete proof artifacts the drill produces (test ids, ledger rows, dashboards). */
    proofArtifacts: z.array(z.string().trim().min(1)).min(1),
    /** Repo-relative runbook doc; must exist. */
    runbook: z
      .string()
      .trim()
      .min(1)
      .regex(/^docs\//),
  })
  .strict()
  .superRefine((playbook, ctx) => {
    if (playbook.irreversible && !playbook.recoveryGate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'irreversible release class requires an explicit recoveryGate (migration gate + recovery path)',
      });
    }
    if (playbook.strategy === 'forward_fix' && playbook.rtoMinutes > 240) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'forward_fix classes cannot tolerate multi-hour recovery; bound must be <= 240m',
      });
    }
  });

export type RollbackPlaybook = z.infer<typeof RollbackPlaybookSchema>;

const ON_CALL = 'docs/ON_CALL_PROCESS.md';
const DB_MIGRATIONS = 'docs/DB_MIGRATIONS.md';

export const ROLLBACK_PLAYBOOKS: readonly RollbackPlaybook[] = [
  {
    id: 'web-deploy',
    title: 'Web app deploy (Next.js on Vercel)',
    releaseClass: 'web-deploy',
    strategy: 'rollback',
    owner: 'engineering',
    rtoMinutes: 15,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'API/route contracts are additive within a deploy; stale clients are served from the immutable previous deployment until they revalidate.',
    },
    preDeployArtifacts: [
      {
        artifact: 'stale-web-clients',
        handling: 'interpretable',
        mechanism:
          'responses carry no required fields older clients lack; Next.js deployment-id mismatch triggers client-side reload on chunk fetch failure.',
      },
      {
        artifact: 'in-flight-requests',
        handling: 'interpretable',
        mechanism:
          'requests in flight finish on the draining lambda; no mid-request contract change within a request.',
      },
      {
        artifact: 'cached-assets',
        handling: 'interpretable',
        mechanism:
          'hashed static assets and immutable cache headers make old and new assets coexist indefinitely.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'Promote the previous production deployment via the Vercel alias; hold gate in the rollout staircase (JOV-5932) can also freeze exposure.',
      completionSignal:
        'production deployment marker (JOV-5910) reports the prior SHA live and production probes pass against it.',
    },
    drillJourneys: ['marketing-home-render', 'artist-profile-public'],
    drillCadenceDays: 30,
    evidenceChannels: ['release-lineage', 'certification-registry'],
    proofArtifacts: [
      'release-lineage row marked rolled_back with prior SHA',
      'production probe pass on restored deployment',
      'promotion timestamp vs alarm timestamp for RTO measurement',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'schema-migration',
    title: 'Database schema migration (Drizzle)',
    releaseClass: 'schema-migration',
    strategy: 'rollback',
    owner: 'engineering',
    rtoMinutes: 60,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'expand/contract discipline: migrations only add or widen; destructive contract steps ship as a separate migration at least one release later so the previous app version still runs.',
    },
    preDeployArtifacts: [
      {
        artifact: 'in-flight-requests',
        handling: 'interpretable',
        mechanism:
          'expand-first migrations keep old columns readable for the entire compatibility window; NOT NULL and renames wait for the contract step.',
      },
      {
        artifact: 'queued-jobs',
        handling: 'interpretable',
        mechanism:
          'job payloads are written against the expanded schema which both app versions can read.',
      },
      {
        artifact: 'cached-data',
        handling: 'reconciled',
        mechanism:
          'cache entries keyed on shape-affecting fields are invalidated or carry a schema-version key segment.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'Rolling back the app deployment restores the old code path, which still reads the expanded schema; the contract/drop migration is never deployed in the same release.',
      completionSignal:
        'migration journal shows no pending destructive step and old-version smoke queries pass.',
    },
    drillJourneys: ['signup-onboarding', 'checkout-billing'],
    drillCadenceDays: 30,
    evidenceChannels: ['release-lineage', 'incident-report'],
    proofArtifacts: [
      'migration journal entry + applied timestamp',
      'old-app-against-new-schema smoke query log',
      'expansion/contract split recorded in the PR that ships the contract step',
    ],
    runbook: DB_MIGRATIONS,
  },
  {
    id: 'destructive-migration',
    title:
      'Destructive / irreversible schema step (drop, rename, backfill-in-place)',
    releaseClass: 'schema-migration',
    strategy: 'forward_fix',
    owner: 'engineering',
    rtoMinutes: 120,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'only allowed after the compatibility window has elapsed — the prior app version must already be out of rotation before the destructive step applies.',
    },
    preDeployArtifacts: [
      {
        artifact: 'queued-jobs',
        handling: 'reconciled',
        mechanism:
          'a pre-gate drain or payload-rewrite pass converts or completes all jobs written against the dropped shape before the migration runs.',
      },
      {
        artifact: 'cached-data',
        handling: 'reconciled',
        mechanism:
          'versioned cache keys are bumped with the migration so no reader sees a dropped column shape.',
      },
    ],
    irreversible: true,
    recoveryGate: {
      gate: 'Migration Guard approval + verified snapshot/backup receipt recorded before the destructive migration is allowed to apply; composes JOV-6044 gates.',
      recoveryPath:
        'restore from the verified snapshot and replay the append-only ledger/outbox written after the snapshot point.',
    },
    boundedStop: {
      mechanism:
        'the migration runner refuses destructive ops without a recorded gate receipt; abort leaves the expanded schema in place.',
      completionSignal:
        'gate receipt id + migration id are written to the release lineage and the post-restore verification query returns the expected row counts.',
    },
    drillJourneys: ['checkout-billing', 'signup-onboarding'],
    drillCadenceDays: 30,
    evidenceChannels: [
      'release-lineage',
      'certification-registry',
      'incident-report',
    ],
    proofArtifacts: [
      'snapshot/backup verification receipt',
      'gate approval record bound to the migration id',
      'post-restore row-count diff report',
    ],
    runbook: DB_MIGRATIONS,
  },
  {
    id: 'data-backfill',
    title: 'Data backfill / repair job',
    releaseClass: 'data-backfill',
    strategy: 'forward_fix',
    owner: 'data',
    rtoMinutes: 240,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'backfills are idempotent and checkpointed; they write through the current write path so both old and new readers interpret results identically.',
    },
    preDeployArtifacts: [
      {
        artifact: 'queued-jobs',
        handling: 'interpretable',
        mechanism:
          'checkpoint rows let a resumed backfill skip already-written ranges regardless of which app version enqueued them.',
      },
      {
        artifact: 'cached-data',
        handling: 'reconciled',
        mechanism:
          'backfill completion invalidates affected cache keys through the same invalidation path as normal writes.',
      },
    ],
    irreversible: true,
    recoveryGate: {
      gate: 'dry-run on a sampled range with a written before/after diff report approved before the full run; batch size and throttle recorded in the run manifest.',
      recoveryPath:
        'compensating backfill driven by the recorded diff report, or snapshot restore for tables under the gate.',
    },
    boundedStop: {
      mechanism:
        'backfill runner exposes a stop flag honored between batches; checkpoints mean stop is safe at any batch boundary.',
      completionSignal:
        'run manifest transitions to stopped/completed with checkpoint cursor persisted; progress rows are queryable.',
    },
    drillJourneys: ['release-publish', 'checkout-billing'],
    drillCadenceDays: 60,
    evidenceChannels: ['certification-registry', 'incident-report'],
    proofArtifacts: [
      'dry-run diff report artifact',
      'run manifest with checkpoint cursor',
      'post-run invariant query results',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'queue-job-contract',
    title: 'Queue/job payload contract change',
    releaseClass: 'queue-job-contract',
    strategy: 'hold_and_quarantine',
    owner: 'engineering',
    rtoMinutes: 60,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'job payloads carry a contract version field; readers must accept the current and previous version — jobs enqueued before a deploy remain interpretable.',
    },
    preDeployArtifacts: [
      {
        artifact: 'queued-jobs',
        handling: 'interpretable',
        mechanism:
          'dual-version readers decode v(N-1) payloads; unrecognizable payloads are routed to a quarantine queue instead of being dropped or crash-looped.',
      },
      {
        artifact: 'provider-webhooks',
        handling: 'quarantined',
        mechanism:
          'webhook payloads are persisted raw before processing; a contract break replays from the stored payload after fix.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'pause the affected queue consumer; producers keep enqueueing durably while the consumer is held.',
      completionSignal:
        'queue depth is stable and quarantine queue is empty (or fully accounted) before consumers resume.',
    },
    drillJourneys: [
      'release-publish',
      'smartlink-fan-click',
      'chat-agent-turn',
    ],
    drillCadenceDays: 30,
    evidenceChannels: ['release-lineage', 'incident-report'],
    proofArtifacts: [
      'dual-version decode test vectors for N and N-1 payloads',
      'quarantine queue accounting report',
      'drain/replay log for held jobs',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'worker-deploy',
    title: 'Long-lived worker / agent runtime deploy',
    releaseClass: 'worker-deploy',
    strategy: 'rollback',
    owner: 'engineering',
    rtoMinutes: 30,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'workers checkpoint durable state before exit; new worker version must read checkpoints written by the prior version.',
    },
    preDeployArtifacts: [
      {
        artifact: 'long-lived-connections',
        handling: 'reconciled',
        mechanism:
          'SIGTERM drains in-flight units of work to a checkpoint; reconnects resume from the durable cursor on the new version.',
      },
      {
        artifact: 'queued-jobs',
        handling: 'interpretable',
        mechanism:
          'jobs stay in the queue during drain; lease expiry returns unfinished units instead of losing them.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'redeploy the prior worker image / trigger a graceful drain; in-flight work resumes from checkpoints rather than being lost.',
      completionSignal:
        'zero in-flight units older than the drain timeout and heartbeat check-ins resumed on the prior version.',
    },
    drillJourneys: ['chat-agent-turn', 'release-publish'],
    drillCadenceDays: 30,
    evidenceChannels: ['release-lineage', 'incident-report'],
    proofArtifacts: [
      'drain log showing checkpointed units',
      'post-rollback heartbeat on prior version',
      'orphan-sweep report showing no leaked work',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'client-release',
    title: 'Native client release (iOS / desktop)',
    releaseClass: 'client-release',
    strategy: 'forward_fix',
    owner: 'mobile',
    rtoMinutes: 240,
    compatibilityWindow: {
      priorVersions: 2,
      enforcement:
        'server endpoints must remain interpretable to the two previous shipped client versions; breaking API changes ship behind versioned endpoints or capability negotiation.',
    },
    preDeployArtifacts: [
      {
        artifact: 'stale-native-clients',
        handling: 'interpretable',
        mechanism:
          'capability negotiation + versioned API paths keep older installed clients functional; minimum-supported-version gating nudges instead of hard-breaking.',
      },
      {
        artifact: 'cached-data',
        handling: 'interpretable',
        mechanism:
          'on-device persisted models are migrated forward on launch; store-version bumps are one-directional and never reach back into deleted tables.',
      },
    ],
    irreversible: true,
    recoveryGate: {
      gate: 'phased release with halt capability (App Store phased rollout / staged desktop rollout); irreversible on-device migrations require a shipped migration test covering the prior store version.',
      recoveryPath:
        'halt the rollout to stop new installs, ship an expedited hotfix release; server-side compat keeps already-upgraded and not-yet-upgraded users working.',
    },
    boundedStop: {
      mechanism:
        'halt the phased rollout in the store console — bounded to users who already installed.',
      completionSignal:
        'rollout dashboard shows halted state and crash-free sessions return to baseline on the affected cohort.',
    },
    drillJourneys: ['signup-onboarding', 'chat-agent-turn'],
    drillCadenceDays: 60,
    evidenceChannels: ['certification-registry', 'incident-report'],
    proofArtifacts: [
      'halt receipt from the store console',
      'cohort crash-free rate before/after halt',
      'store-version migration test result for N-1 → N',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'cache-config',
    title: 'Cache / CDN configuration change',
    releaseClass: 'cache-config',
    strategy: 'rollback',
    owner: 'engineering',
    rtoMinutes: 15,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'cache-key shape changes are versioned; a rollback restores the prior key version and stale entries expire by TTL rather than poisoning reads.',
    },
    preDeployArtifacts: [
      {
        artifact: 'cached-assets',
        handling: 'interpretable',
        mechanism:
          'immutable hashed asset URLs mean old entries are unreachable-but-harmless after rollback.',
      },
      {
        artifact: 'cached-data',
        handling: 'quarantined',
        mechanism:
          'a cache-key version bump isolates entries written under the old config; rollback flips the version back instead of purging.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'revert the config change through the same deploy path that applied it (config is part of the release, per JOV-6053 parity).',
      completionSignal:
        'cache-hit/miss dashboard and stale-read alarms return to baseline; a probe fetch asserts fresh content.',
    },
    drillJourneys: ['marketing-home-render', 'artist-profile-public'],
    drillCadenceDays: 60,
    evidenceChannels: ['release-lineage'],
    proofArtifacts: [
      'config diff attached to the release lineage row',
      'probe result on restored cache config',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'feature-flag',
    title: 'Feature flag / kill-switch change',
    releaseClass: 'feature-flag',
    strategy: 'rollback',
    owner: 'engineering',
    rtoMinutes: 5,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'flag evaluation is independent of app version; stale clients read the flag service directly so a kill applies fleet-wide without a deploy.',
    },
    preDeployArtifacts: [
      {
        artifact: 'stale-web-clients',
        handling: 'interpretable',
        mechanism:
          'flag state is evaluated at request/eval time; a kill flips behavior for old and new clients identically.',
      },
      {
        artifact: 'stale-native-clients',
        handling: 'interpretable',
        mechanism:
          'native clients re-fetch flag values on launch and on the refresh interval; kill-switch latency is bounded by the refresh cadence.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'flag kill-switch per JOV-6055 targeting rules — the flag flip IS the bounded stop, no redeploy needed.',
      completionSignal:
        'flag audit log row + evaluation metrics show the off variant serving 100% of targeted traffic.',
    },
    drillJourneys: ['marketing-home-render', 'checkout-billing'],
    drillCadenceDays: 30,
    evidenceChannels: ['certification-registry'],
    proofArtifacts: [
      'flag audit-log entry with actor and timestamp',
      'evaluation-split metric showing full kill',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'webhook-contract',
    title: 'Provider webhook/event contract change (Stripe, Clerk, …)',
    releaseClass: 'webhook-contract',
    strategy: 'hold_and_quarantine',
    owner: 'engineering',
    rtoMinutes: 60,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'raw webhook payloads are persisted before processing; handlers accept current and previous event shapes for the window.',
    },
    preDeployArtifacts: [
      {
        artifact: 'provider-webhooks',
        handling: 'quarantined',
        mechanism:
          'unprocessable events are stored with their raw payload and a failure reason, then replayed after the fix — never acknowledged-and-dropped.',
      },
      {
        artifact: 'queued-jobs',
        handling: 'interpretable',
        mechanism:
          'webhook-derived jobs carry the same dual-version contract as queue-job-contract.',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'hold processing for the affected event type (acknowledge-and-store without handling) while the handler is fixed or rolled back.',
      completionSignal:
        'held-event queue drains to zero after replay and provider retry dashboards show no pending failures.',
    },
    drillJourneys: ['checkout-billing', 'signup-onboarding'],
    drillCadenceDays: 30,
    evidenceChannels: ['certification-registry', 'incident-report'],
    proofArtifacts: [
      'raw-payload store coverage for held events',
      'replay log reconciling every quarantined event',
      'provider-side retry/failure dashboard cleared',
    ],
    runbook: ON_CALL,
  },
  {
    id: 'env-config',
    title: 'Environment / runtime configuration change',
    releaseClass: 'env-config',
    strategy: 'rollback',
    owner: 'operations',
    rtoMinutes: 30,
    compatibilityWindow: {
      priorVersions: 1,
      enforcement:
        'config is part of the release per JOV-6053 parity — a change ships with the code that consumes it and rolls back with it; schema-validated at boot.',
    },
    preDeployArtifacts: [
      {
        artifact: 'long-lived-connections',
        handling: 'reconciled',
        mechanism:
          'config is read at process boot; rollback redeploys prior env which new instances pick up, while draining instances finish on the old config.',
      },
      {
        artifact: 'cached-data',
        handling: 'interpretable',
        mechanism:
          'config-driven behavior changes do not alter stored shapes unless paired with a cache-key version bump (see cache-config).',
      },
    ],
    irreversible: false,
    boundedStop: {
      mechanism:
        'revert the config in the secrets/config store and redeploy; boot-time schema validation refuses a config the code cannot consume.',
      completionSignal:
        'boot-time env schema validation passes on the restored config and the parity check (JOV-6053) reports no drift.',
    },
    drillJourneys: ['checkout-billing', 'chat-agent-turn'],
    drillCadenceDays: 60,
    evidenceChannels: ['release-lineage', 'incident-report'],
    proofArtifacts: [
      'env parity check output before/after rollback',
      'boot validation log on restored config',
    ],
    runbook: ON_CALL,
  },
] as const;

export function getRollbackPlaybook(id: string): RollbackPlaybook | undefined {
  return ROLLBACK_PLAYBOOKS.find(playbook => playbook.id === id);
}
