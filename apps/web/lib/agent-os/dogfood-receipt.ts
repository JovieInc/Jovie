/**
 * JOV-6646 — certification v2 agent dogfood producers.
 *
 * Emits `jovie.dogfood-receipt/v1` receipts from the existing drivers named in
 * docs/design-system/CERTIFICATION_V2_DOGFOOD.md section 4:
 *
 *   - Playwright missions against production with the subject flag on
 *     (`ui_agent`, driver `playwright`)
 *   - per-artist MCP / Ovie MCP / read-only `@jovie/cli` command runs
 *     (`agent_on_behalf`, drivers `mcp` / `cli`)
 *   - `apps/ios/scripts/dogfood-ios.sh` report.json adapter
 *     (`ui_agent`, driver `xcuitest`)
 *
 * Missions come from the identity's existing assurance profile; this module
 * only shapes, validates, and evaluates the receipts those drivers emit. A
 * receipt counts toward a mission only when its `commitSha` and
 * `deploymentId` exactly match the subject's current deploy receipt.
 */

import {
  buildFleetInvocation,
  type FleetInvocationEvidence,
  type FleetInvocationInput,
  validateFleetInvocation,
} from '@/lib/agent-os/fleet-hardening';

export const JOVIE_DOGFOOD_RECEIPT_SCHEMA = 'jovie.dogfood-receipt/v1' as const;
export const IOS_DOGFOOD_REPORT_SCHEMA = 'jovie-ios-dogfood/v1' as const;

export const DOGFOOD_PRODUCTS = ['jov', 'lyb', 'ovie'] as const;
export type DogfoodProduct = (typeof DOGFOOD_PRODUCTS)[number];

export const DOGFOOD_KINDS = [
  'ui_agent',
  'agent_on_behalf',
  'instincts',
  'local_agent',
  'mac_closed_loop',
  'founder_real_account',
  'human_signal',
] as const;
export type DogfoodKind = (typeof DOGFOOD_KINDS)[number];

/**
 * Agent kinds whose passing runs can satisfy the reliability rule. Per spec,
 * `founder_real_account` receipts can certify a subject but never make it
 * machine-certifiable, and `human_signal` is weighted signal only.
 */
export const AGENT_DOGFOOD_KINDS = [
  'ui_agent',
  'agent_on_behalf',
  'local_agent',
  'mac_closed_loop',
  'instincts',
] as const satisfies readonly DogfoodKind[];
export type AgentDogfoodKind = (typeof AGENT_DOGFOOD_KINDS)[number];

export const DOGFOOD_DRIVERS = [
  'playwright',
  'xcuitest',
  'mcp',
  'cli',
  'computer_use',
  'instincts',
  'local_agent',
  'human',
] as const;
export type DogfoodDriver = (typeof DOGFOOD_DRIVERS)[number];

export const DETERMINISTIC_DOGFOOD_DRIVERS = [
  'playwright',
  'xcuitest',
  'mcp',
  'cli',
] as const satisfies readonly DogfoodDriver[];
export const MODEL_DRIVEN_DOGFOOD_DRIVERS = [
  'computer_use',
  'instincts',
  'local_agent',
] as const satisfies readonly DogfoodDriver[];

export const DOGFOOD_OUTCOMES = ['passed', 'failed', 'blocked'] as const;
export type DogfoodOutcome = (typeof DOGFOOD_OUTCOMES)[number];

export interface DogfoodReceiptPrivacy {
  readonly conversationContentRetained: boolean;
  readonly credentialsRetained: boolean;
  readonly accountIdentityRetained: boolean;
  readonly unrelatedPersonalDataRetained: boolean;
}

export const DOGFOOD_RECEIPT_NO_RETENTION: DogfoodReceiptPrivacy = {
  accountIdentityRetained: false,
  conversationContentRetained: false,
  credentialsRetained: false,
  unrelatedPersonalDataRetained: false,
};

export interface DogfoodReceipt {
  readonly schema: typeof JOVIE_DOGFOOD_RECEIPT_SCHEMA;
  readonly subjectId: string;
  readonly product: DogfoodProduct;
  readonly kind: DogfoodKind;
  readonly driver: DogfoodDriver;
  readonly missionId: string;
  readonly actor: string;
  readonly environment: string;
  readonly deploymentId: string;
  readonly commitSha: string;
  readonly flagCohort: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: DogfoodOutcome;
  readonly blocker: string | null;
  readonly evidenceRefs: readonly string[];
  readonly invocation: FleetInvocationEvidence | null;
  readonly privacy: DogfoodReceiptPrivacy;
}

export interface DogfoodReceiptInput {
  readonly subjectId: string;
  readonly product: DogfoodProduct;
  readonly kind: DogfoodKind;
  readonly driver: DogfoodDriver;
  readonly missionId: string;
  readonly actor: string;
  readonly environment: string;
  readonly deploymentId: string;
  readonly commitSha: string;
  readonly flagCohort: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: DogfoodOutcome;
  readonly blocker?: string | null;
  readonly evidenceRefs?: readonly string[];
  readonly invocation?: FleetInvocationEvidence | null;
  readonly privacy?: DogfoodReceiptPrivacy;
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

const DOGFOOD_PRIVACY_KEYS = [
  'conversationContentRetained',
  'credentialsRetained',
  'accountIdentityRetained',
  'unrelatedPersonalDataRetained',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkEnum(
  value: unknown,
  allowed: readonly string[],
  field: string,
  errors: string[]
): void {
  if (!nonEmpty(value) || !allowed.includes(value)) {
    errors.push(`${field} must be one of ${allowed.join(', ')}`);
  }
}

function checkTimestamp(value: unknown, field: string, errors: string[]): void {
  if (!nonEmpty(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${field} must be an ISO timestamp`);
  }
}

function checkPrivacy(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('privacy block is required');
    return;
  }
  for (const key of DOGFOOD_PRIVACY_KEYS) {
    if (typeof value[key] !== 'boolean') {
      errors.push(`privacy.${key} must be a boolean`);
    }
  }
}

/**
 * Validates a candidate receipt. Returns the list of violations; empty means
 * the receipt is well-formed. Producers must not emit invalid receipts —
 * `buildDogfoodReceipt` throws on the first violation.
 */
export function validateDogfoodReceipt(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['receipt must be an object'];
  }

  if (value.schema !== JOVIE_DOGFOOD_RECEIPT_SCHEMA) {
    errors.push(`schema must be ${JOVIE_DOGFOOD_RECEIPT_SCHEMA}`);
  }
  if (!nonEmpty(value.subjectId)) errors.push('subjectId is required');
  checkEnum(value.product, DOGFOOD_PRODUCTS, 'product', errors);
  checkEnum(value.kind, DOGFOOD_KINDS, 'kind', errors);
  checkEnum(value.driver, DOGFOOD_DRIVERS, 'driver', errors);
  if (!nonEmpty(value.missionId)) errors.push('missionId is required');
  if (!nonEmpty(value.actor)) errors.push('actor is required');
  if (!nonEmpty(value.environment)) errors.push('environment is required');
  if (!nonEmpty(value.deploymentId)) {
    errors.push('deploymentId is required');
  }
  if (!nonEmpty(value.commitSha) || !COMMIT_SHA_PATTERN.test(value.commitSha)) {
    errors.push('commitSha must be a full 40-hex commit SHA');
  }
  if (!nonEmpty(value.flagCohort)) errors.push('flagCohort is required');
  checkTimestamp(value.startedAt, 'startedAt', errors);
  checkTimestamp(value.completedAt, 'completedAt', errors);
  checkEnum(value.outcome, DOGFOOD_OUTCOMES, 'outcome', errors);
  if (value.blocker !== null && !nonEmpty(value.blocker)) {
    errors.push('blocker must be a non-empty string or null');
  }
  if (
    !Array.isArray(value.evidenceRefs) ||
    !value.evidenceRefs.every(nonEmpty)
  ) {
    errors.push('evidenceRefs must be an array of non-empty strings');
  }
  // Legacy v1 receipts remain readable; command adapters always add this block.
  if (isRecord(value.invocation)) {
    const invocation = value.invocation as unknown as FleetInvocationEvidence;
    const invocationErrors = validateFleetInvocation(invocation);
    errors.push(...invocationErrors);
    if (
      invocationErrors.length === 0 &&
      (value.outcome !== 'passed' ||
        invocation.workaroundUsed ||
        invocation.bypassUsed ||
        invocation.canonicalComparison.status === 'mismatched') &&
      invocation.defectFingerprint === null
    ) {
      errors.push(
        'failed or frictional invocations require a defect fingerprint'
      );
    }
  }
  checkPrivacy(value.privacy, errors);
  return errors;
}

export function isDogfoodReceipt(value: unknown): value is DogfoodReceipt {
  return validateDogfoodReceipt(value).length === 0;
}

export function buildDogfoodReceipt(
  input: DogfoodReceiptInput
): DogfoodReceipt {
  const receipt: DogfoodReceipt = {
    actor: input.actor,
    blocker: input.blocker ?? null,
    commitSha: input.commitSha,
    completedAt: input.completedAt,
    deploymentId: input.deploymentId,
    driver: input.driver,
    environment: input.environment,
    evidenceRefs: input.evidenceRefs ?? [],
    flagCohort: input.flagCohort,
    invocation: input.invocation ?? null,
    kind: input.kind,
    missionId: input.missionId,
    outcome: input.outcome,
    privacy: input.privacy ?? DOGFOOD_RECEIPT_NO_RETENTION,
    product: input.product,
    schema: JOVIE_DOGFOOD_RECEIPT_SCHEMA,
    startedAt: input.startedAt,
    subjectId: input.subjectId,
  };
  const errors = validateDogfoodReceipt(receipt);
  if (errors.length > 0) {
    throw new Error(`invalid dogfood receipt: ${errors.join('; ')}`);
  }
  return receipt;
}

/** Shared deploy binding: the exact deploy a receipt must match to count. */
export interface DogfoodDeployBinding {
  readonly commitSha: string;
  readonly deploymentId: string;
}

/**
 * Run context shared by every producer: everything except what the driver
 * itself observed (outcome, timing, blocker, evidence).
 */
export interface DogfoodMissionContext extends DogfoodDeployBinding {
  readonly subjectId: string;
  readonly product: DogfoodProduct;
  readonly missionId: string;
  readonly actor: string;
  readonly environment: string;
  readonly flagCohort: string;
  readonly evidenceRefs?: readonly string[];
  readonly privacy?: DogfoodReceiptPrivacy;
}

/**
 * Structural subset of the Playwright JSON reporter output a mission run
 * produces (`--reporter=json`). Only the aggregate stats are needed to decide
 * the mission outcome.
 */
export interface PlaywrightMissionReport {
  readonly stats?: {
    readonly expected?: number;
    readonly unexpected?: number;
    readonly flaky?: number;
    readonly skipped?: number;
    readonly startTime?: string;
    readonly duration?: number;
  };
}

export function dogfoodReceiptFromPlaywrightReport(
  context: DogfoodMissionContext,
  report: PlaywrightMissionReport,
  timing?: { readonly startedAt?: string; readonly completedAt?: string }
): DogfoodReceipt {
  const stats = report.stats ?? {};
  const executed =
    (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0);
  const unexpected = stats.unexpected ?? 0;

  let outcome: DogfoodOutcome;
  let blocker: string | null = null;
  if (executed === 0) {
    outcome = 'blocked';
    blocker = 'playwright mission ran no tests';
  } else if (unexpected > 0) {
    outcome = 'failed';
    blocker = `${unexpected} unexpected playwright failure(s)`;
  } else {
    outcome = 'passed';
  }

  const startedAt =
    timing?.startedAt ?? stats.startTime ?? new Date().toISOString();
  const completedAt =
    timing?.completedAt ??
    (typeof stats.duration === 'number' && !Number.isNaN(Date.parse(startedAt))
      ? new Date(Date.parse(startedAt) + stats.duration).toISOString()
      : new Date().toISOString());

  return buildDogfoodReceipt({
    ...context,
    blocker,
    completedAt,
    driver: 'playwright',
    evidenceRefs: context.evidenceRefs,
    kind: 'ui_agent',
    outcome,
    startedAt,
  });
}

/** One read-only command execution (MCP call or `@jovie/cli` invocation). */
export interface DogfoodCommandRun {
  readonly invocation: FleetInvocationInput;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly blocker?: string;
}

export function dogfoodReceiptFromCommandRun(
  context: DogfoodMissionContext,
  driver: 'mcp' | 'cli',
  run: DogfoodCommandRun
): DogfoodReceipt {
  let outcome: DogfoodOutcome;
  let blocker: string | null = run.blocker ?? null;
  const command = run.invocation.command.redactedArgv.join(' ');
  if (run.invocation.exitCode === null) {
    outcome = 'blocked';
    blocker ??= `command did not complete: ${command}`;
  } else if (run.invocation.exitCode === 0) {
    outcome = 'passed';
  } else {
    outcome = 'failed';
    blocker ??= `command exited ${run.invocation.exitCode}: ${command}`;
  }

  return buildDogfoodReceipt({
    ...context,
    blocker,
    completedAt: run.completedAt,
    driver,
    evidenceRefs: context.evidenceRefs,
    invocation: buildFleetInvocation(
      run.invocation,
      run.startedAt,
      run.completedAt
    ),
    kind: 'agent_on_behalf',
    outcome,
    startedAt: run.startedAt,
  });
}

/** Structural subset of `jovie-ios-dogfood/v1` report.json. */
export interface IosDogfoodReport {
  readonly schema?: string;
  readonly verdict?: 'pass' | 'fail' | 'inconclusive';
  readonly run?: {
    readonly started_at?: string;
    readonly finished_at?: string;
  };
  readonly issues?: readonly {
    readonly surface?: string;
    readonly issue?: string;
  }[];
  readonly crashes?: readonly { readonly report?: string }[];
  readonly artifacts?: Record<string, string | undefined>;
}

export function dogfoodReceiptFromIosReport(
  context: DogfoodMissionContext,
  report: IosDogfoodReport
): DogfoodReceipt {
  if (report.schema !== IOS_DOGFOOD_REPORT_SCHEMA) {
    throw new Error(
      `iOS dogfood report must use ${IOS_DOGFOOD_REPORT_SCHEMA} schema`
    );
  }

  let outcome: DogfoodOutcome;
  let blocker: string | null = null;
  if (report.verdict === 'pass') {
    outcome = 'passed';
  } else if (report.verdict === 'fail') {
    outcome = 'failed';
    const first = report.issues?.[0];
    blocker = first
      ? `${first.surface ?? 'ios'}: ${first.issue ?? 'dogfood check failed'}`
      : 'iOS dogfood verdict=fail';
  } else {
    outcome = 'blocked';
    blocker = `iOS dogfood verdict=${report.verdict ?? 'missing'}`;
  }

  const evidenceRefs = [
    ...(context.evidenceRefs ?? []),
    ...Object.values(report.artifacts ?? {}).filter(
      (ref): ref is string => typeof ref === 'string' && ref.length > 0
    ),
  ];

  return buildDogfoodReceipt({
    ...context,
    blocker,
    completedAt: report.run?.finished_at ?? new Date().toISOString(),
    driver: 'xcuitest',
    evidenceRefs,
    kind: 'ui_agent',
    outcome,
    startedAt: report.run?.started_at ?? new Date().toISOString(),
  });
}

export type DogfoodDriverClass = 'deterministic' | 'model_driven' | 'human';

export function dogfoodDriverClass(driver: DogfoodDriver): DogfoodDriverClass {
  if (
    (DETERMINISTIC_DOGFOOD_DRIVERS as readonly DogfoodDriver[]).includes(driver)
  ) {
    return 'deterministic';
  }
  if (
    (MODEL_DRIVEN_DOGFOOD_DRIVERS as readonly DogfoodDriver[]).includes(driver)
  ) {
    return 'model_driven';
  }
  return 'human';
}

/**
 * Ship-now reliability rule (spec section 4): deterministic drivers count a
 * kind for a mission only when the latest 3 runs on the exact deploy all
 * passed; model-driven drivers need at least 4 of the latest 5.
 */
export const DOGFOOD_RELIABILITY_RUNS = {
  deterministic: { passing: 3, runs: 3 },
  model_driven: { passing: 4, runs: 5 },
} as const;

export interface DogfoodMissionSpec {
  readonly id: string;
  readonly required?: boolean;
}

export interface MissionReliabilityResult {
  readonly missionId: string;
  readonly required: boolean;
  /** `kind:driver` pairs that meet the reliability rule on the exact deploy. */
  readonly reliableAgents: readonly string[];
  readonly status: 'reliable' | 'unmet';
}

export interface DogfoodReliabilityEvaluation extends DogfoodDeployBinding {
  readonly missions: readonly MissionReliabilityResult[];
  /**
   * False when any required mission has no reliable agent kind on the exact
   * deploy — the subject can still reach `dogfood_certified` via
   * `founder_real_account` receipts or Tim's decision.
   */
  readonly machineCertifiable: boolean;
}

export function evaluateDogfoodReliability(
  receipts: readonly DogfoodReceipt[],
  binding: DogfoodDeployBinding,
  missions: readonly (DogfoodMissionSpec | string)[]
): DogfoodReliabilityEvaluation {
  const onDeploy = receipts.filter(
    receipt =>
      receipt.commitSha === binding.commitSha &&
      receipt.deploymentId === binding.deploymentId
  );

  const results: MissionReliabilityResult[] = missions.map(mission => {
    const spec: DogfoodMissionSpec =
      typeof mission === 'string' ? { id: mission } : mission;
    const required = spec.required ?? true;
    const missionReceipts = onDeploy.filter(
      receipt => receipt.missionId === spec.id
    );

    const byAgent = new Map<string, DogfoodReceipt[]>();
    for (const receipt of missionReceipts) {
      if (
        !(AGENT_DOGFOOD_KINDS as readonly DogfoodKind[]).includes(receipt.kind)
      ) {
        continue;
      }
      const key = `${receipt.kind}:${receipt.driver}`;
      const bucket = byAgent.get(key);
      if (bucket) {
        bucket.push(receipt);
      } else {
        byAgent.set(key, [receipt]);
      }
    }

    const reliableAgents = [...byAgent.entries()]
      .filter(([key, runs]) => {
        const driver = key.split(':').pop() as DogfoodDriver;
        const driverClass = dogfoodDriverClass(driver);
        if (driverClass === 'human') return false;
        const rule = DOGFOOD_RELIABILITY_RUNS[driverClass];
        if (runs.length < rule.runs) return false;
        const latest = [...runs]
          .sort((left, right) =>
            right.completedAt.localeCompare(left.completedAt)
          )
          .slice(0, rule.runs);
        return (
          latest.filter(run => run.outcome === 'passed').length >= rule.passing
        );
      })
      .map(([key]) => key)
      .sort((left, right) => left.localeCompare(right));

    return {
      missionId: spec.id,
      reliableAgents,
      required,
      status: reliableAgents.length > 0 ? 'reliable' : 'unmet',
    };
  });

  return {
    commitSha: binding.commitSha,
    deploymentId: binding.deploymentId,
    machineCertifiable: results.every(
      result => !result.required || result.status === 'reliable'
    ),
    missions: results,
  };
}
