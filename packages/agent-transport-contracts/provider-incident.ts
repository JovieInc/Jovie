import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Content-free incident handoff shared by isolated agent runtimes.
 *
 * Summer and Zoe keep separate identities, credentials, conversations, and
 * authority. Only a normalized provider failure class, safe evidence refs,
 * and per-path verification cross this boundary; provider routing is never
 * mutated here.
 */
export const PROVIDER_INCIDENT_HANDOFF_SCHEMA =
  'jovie.provider-incident-handoff/v1' as const;
export const PROVIDER_INCIDENT_MAX_RETRIES = 2 as const;

const PROVIDER = 'vercel-ai-gateway' as const;
const ACCOUNT_BOUNDARY = 'shared-ai-gateway' as const;
const INCIDENT_OWNER = 'provider-incident-controller' as const;
const timestamp = z.string().datetime();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const safeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u);
const evidenceRef = z
  .string()
  .min(8)
  .max(512)
  .regex(
    /^(?:https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/-]*)?|(?:artifact|record):\/\/[A-Za-z0-9._~:/-]+)$/u
  );

export const providerIncidentPathSchema = z.enum(['summer-imessage', 'zoe']);
export type ProviderIncidentPath = z.infer<typeof providerIncidentPathSchema>;

export const providerFailureClassSchema = z.enum([
  'credentials',
  'human_decision',
  'permissions',
  'permanent_request',
  'spend',
  'transient_provider',
  'unknown',
]);
export type ProviderFailureClass = z.infer<typeof providerFailureClassSchema>;

const baselineSchema = z
  .object({
    state: z.enum(['healthy', 'degraded', 'unknown']),
    observedAt: timestamp,
    evidenceRef,
  })
  .strict();

const retryAttemptSchema = z
  .object({
    retryId: safeId,
    attempt: z.number().int().min(1).max(PROVIDER_INCIDENT_MAX_RETRIES),
    path: providerIncidentPathSchema,
    outcome: z.enum(['failed', 'recovered']),
    completedAt: timestamp,
    evidenceRef,
  })
  .strict();

const verificationSchema = z
  .object({
    status: z.enum(['pending', 'passed', 'failed']),
    checkedAt: timestamp.nullable(),
    evidenceRef: evidenceRef.nullable(),
  })
  .strict();

const actionKindSchema = z.enum([
  'bounded_retry',
  'classified',
  'configuration_repair',
  'credential_repair',
  'permission_repair',
  'provider_health_check',
  'spend_authorization',
]);
export type ProviderIncidentActionKind = z.infer<typeof actionKindSchema>;

export const providerIncidentHandoffSchema = z
  .object({
    schema: z.literal(PROVIDER_INCIDENT_HANDOFF_SCHEMA),
    version: z.number().int().positive(),
    incidentFingerprint: sha256,
    idempotencyKey: z.string().regex(/^provider-incident:[a-f0-9]{64}$/u),
    owner: z.literal(INCIDENT_OWNER),
    failure: z
      .object({
        provider: z.literal(PROVIDER),
        accountBoundary: z.literal(ACCOUNT_BOUNDARY),
        environment: z.literal('production'),
        errorClass: providerFailureClassSchema,
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
        occurrenceCount: z.number().int().positive(),
        affectedPaths: z.array(providerIncidentPathSchema).min(1).max(2),
        baselines: z
          .array(
            z
              .object({
                path: providerIncidentPathSchema,
                baseline: baselineSchema,
              })
              .strict()
          )
          .min(1)
          .max(2),
        httpStatuses: z.array(z.number().int().min(100).max(599)).max(8),
        observationIds: z.array(sha256).min(1),
      })
      .strict(),
    retryPolicy: z
      .object({
        transient: z.boolean(),
        maxAttempts: z.union([
          z.literal(0),
          z.literal(PROVIDER_INCIDENT_MAX_RETRIES),
        ]),
        attempts: z
          .array(retryAttemptSchema)
          .max(PROVIDER_INCIDENT_MAX_RETRIES),
      })
      .strict(),
    action: z
      .object({
        kind: actionKindSchema,
        completedAt: timestamp,
        evidenceRef,
      })
      .strict(),
    afterState: z.enum([
      'failed',
      'remediation_required',
      'verifying',
      'recovered',
    ]),
    rollback: z
      .object({
        layer: z.literal('provider-incident-dedupe-notification'),
        action: z.literal('disable-layer'),
        providerRoutingChanged: z.literal(false),
      })
      .strict(),
    nextOwner: z.enum(['human-authority', INCIDENT_OWNER, 'none']),
    escalation: z
      .object({
        required: z.boolean(),
        reason: z
          .enum(['credentials', 'human_decision', 'permissions', 'spend'])
          .nullable(),
      })
      .strict(),
    verification: z
      .object({
        'summer-imessage': verificationSchema,
        zoe: verificationSchema,
      })
      .strict(),
    contentDigest: sha256,
  })
  .strict();

export type ProviderIncidentHandoff = z.infer<
  typeof providerIncidentHandoffSchema
>;

export interface ProviderFailureObservationInput {
  readonly path: ProviderIncidentPath;
  readonly observedAt: string;
  readonly baseline: z.input<typeof baselineSchema>;
  readonly error: unknown;
  readonly humanDecisionRequired?: boolean;
}

interface NormalizedProviderFailure {
  readonly path: ProviderIncidentPath;
  readonly observedAt: string;
  readonly baseline: z.infer<typeof baselineSchema>;
  readonly errorClass: ProviderFailureClass;
  readonly httpStatuses: readonly number[];
  readonly incidentFingerprint: string;
  readonly observationId: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function collectErrorFacts(error: unknown): {
  readonly statuses: readonly number[];
  readonly text: string;
} {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  const statuses = new Set<number>();
  const text: string[] = [];

  while (pending.length > 0 && seen.size < 48) {
    const candidate = pending.pop();
    if (candidate == null || seen.has(candidate)) continue;
    seen.add(candidate);

    if (typeof candidate === 'string') {
      text.push(candidate);
      const serialized = candidate.trim().replace(/^Error:\s*/u, '');
      if (serialized.startsWith('{') || serialized.startsWith('[')) {
        try {
          pending.push(JSON.parse(serialized));
        } catch {
          // Classification never copies malformed or provider-supplied text.
        }
      }
      continue;
    }
    if (Array.isArray(candidate)) {
      pending.push(...candidate);
      continue;
    }
    if (typeof candidate !== 'object') continue;

    const record = candidate as Record<string, unknown>;
    for (const key of ['name', 'code', 'type', 'errorCode', 'message']) {
      if (typeof record[key] === 'string') {
        text.push(record[key]);
        if (key === 'message') pending.push(record[key]);
      }
    }
    for (const key of ['status', 'statusCode']) {
      const status = record[key];
      if (typeof status === 'number' && status >= 100 && status <= 599) {
        statuses.add(status);
      }
    }
    for (const key of [
      'cause',
      'data',
      'error',
      'errors',
      'lastError',
      'response',
      'responseBody',
    ]) {
      pending.push(record[key]);
    }
  }

  return {
    statuses: [...statuses].sort((left, right) => left - right),
    text: text.join('\n').toLowerCase(),
  };
}

function classifyProviderFailure(
  error: unknown,
  humanDecisionRequired: boolean
): {
  readonly errorClass: ProviderFailureClass;
  readonly statuses: readonly number[];
} {
  const facts = collectErrorFacts(error);
  const hasStatus = (...expected: readonly number[]) =>
    facts.statuses.some(status => expected.includes(status));

  if (humanDecisionRequired) {
    return { errorClass: 'human_decision', statuses: facts.statuses };
  }
  if (
    hasStatus(401) ||
    /authentication|invalid[_ -]?api[_ -]?key|unauthori[sz]ed/u.test(facts.text)
  ) {
    return { errorClass: 'credentials', statuses: facts.statuses };
  }
  if (
    hasStatus(402) ||
    /budget exceeded|insufficient[_ -]?funds|positive credit balance/u.test(
      facts.text
    )
  ) {
    return { errorClass: 'spend', statuses: facts.statuses };
  }
  if (
    hasStatus(403) ||
    /forbidden|permission denied|not permitted/u.test(facts.text)
  ) {
    return { errorClass: 'permissions', statuses: facts.statuses };
  }
  if (
    facts.statuses.some(status =>
      [408, 425, 429, 500, 502, 503, 504, 529].includes(status)
    ) ||
    /connection reset|gatewayinternalservererror|gatewayratelimiterror|gatewaytimeouterror|overloaded|rate limit|temporar(?:y|ily)|timed? ?out|unavailable/u.test(
      facts.text
    )
  ) {
    return { errorClass: 'transient_provider', statuses: facts.statuses };
  }
  if (
    hasStatus(400, 404, 405, 409, 410, 422) ||
    /content policy|invalid request|model not found|unsupported/u.test(
      facts.text
    )
  ) {
    return { errorClass: 'permanent_request', statuses: facts.statuses };
  }
  return { errorClass: 'unknown', statuses: facts.statuses };
}

function incidentFingerprint(errorClass: ProviderFailureClass): string {
  return digest({
    schema: PROVIDER_INCIDENT_HANDOFF_SCHEMA,
    provider: PROVIDER,
    accountBoundary: ACCOUNT_BOUNDARY,
    environment: 'production',
    errorClass,
  });
}

export function normalizeProviderFailure(
  input: ProviderFailureObservationInput
): NormalizedProviderFailure {
  const path = providerIncidentPathSchema.parse(input.path);
  const observedAt = timestamp.parse(input.observedAt);
  const baseline = baselineSchema.parse(input.baseline);
  const classified = classifyProviderFailure(
    input.error,
    input.humanDecisionRequired === true
  );
  const fingerprint = incidentFingerprint(classified.errorClass);
  return {
    path,
    observedAt,
    baseline,
    errorClass: classified.errorClass,
    httpStatuses: classified.statuses,
    incidentFingerprint: fingerprint,
    observationId: digest({
      fingerprint,
      path,
      observedAt,
      httpStatuses: classified.statuses,
    }),
  };
}

function escalationFor(errorClass: ProviderFailureClass) {
  if (
    errorClass === 'credentials' ||
    errorClass === 'human_decision' ||
    errorClass === 'permissions' ||
    errorClass === 'spend'
  ) {
    return { required: true, reason: errorClass } as const;
  }
  return { required: false, reason: null } as const;
}

function expectedAfterState(
  verification: ProviderIncidentHandoff['verification']
): ProviderIncidentHandoff['afterState'] {
  const states = Object.values(verification).map(value => value.status);
  if (states.every(state => state === 'passed')) return 'recovered';
  if (states.some(state => state === 'failed')) return 'remediation_required';
  if (states.some(state => state === 'passed')) return 'verifying';
  return 'failed';
}

function expectedNextOwner(
  afterState: ProviderIncidentHandoff['afterState'],
  escalation: ProviderIncidentHandoff['escalation']
): ProviderIncidentHandoff['nextOwner'] {
  if (afterState === 'recovered') return 'none';
  return escalation.required ? 'human-authority' : INCIDENT_OWNER;
}

function seal(
  value: Omit<ProviderIncidentHandoff, 'contentDigest'> & {
    readonly contentDigest?: string;
  }
): ProviderIncidentHandoff {
  const { contentDigest: _ignored, ...unsigned } = value;
  return providerIncidentHandoffSchema.parse({
    ...unsigned,
    contentDigest: digest(unsigned),
  });
}

function initialVerification(): ProviderIncidentHandoff['verification'] {
  const pending = {
    status: 'pending',
    checkedAt: null,
    evidenceRef: null,
  } as const;
  return { 'summer-imessage': pending, zoe: pending };
}

export function ingestProviderFailure(
  current: unknown | null,
  input: ProviderFailureObservationInput
): ProviderIncidentHandoff {
  const observation = normalizeProviderFailure(input);
  if (current === null) {
    const escalation = escalationFor(observation.errorClass);
    const verification = initialVerification();
    const afterState = expectedAfterState(verification);
    return seal({
      schema: PROVIDER_INCIDENT_HANDOFF_SCHEMA,
      version: 1,
      incidentFingerprint: observation.incidentFingerprint,
      idempotencyKey: `provider-incident:${observation.incidentFingerprint}`,
      owner: INCIDENT_OWNER,
      failure: {
        provider: PROVIDER,
        accountBoundary: ACCOUNT_BOUNDARY,
        environment: 'production',
        errorClass: observation.errorClass,
        firstObservedAt: observation.observedAt,
        lastObservedAt: observation.observedAt,
        occurrenceCount: 1,
        affectedPaths: [observation.path],
        baselines: [{ path: observation.path, baseline: observation.baseline }],
        httpStatuses: [...observation.httpStatuses],
        observationIds: [observation.observationId],
      },
      retryPolicy: {
        transient: observation.errorClass === 'transient_provider',
        maxAttempts:
          observation.errorClass === 'transient_provider'
            ? PROVIDER_INCIDENT_MAX_RETRIES
            : 0,
        attempts: [],
      },
      action: {
        kind: 'classified',
        completedAt: observation.observedAt,
        evidenceRef: observation.baseline.evidenceRef,
      },
      afterState,
      rollback: {
        layer: 'provider-incident-dedupe-notification',
        action: 'disable-layer',
        providerRoutingChanged: false,
      },
      nextOwner: expectedNextOwner(afterState, escalation),
      escalation,
      verification,
    });
  }

  const receipt = verifyProviderIncidentHandoff(current);
  if (receipt.incidentFingerprint !== observation.incidentFingerprint) {
    throw new Error('provider observation belongs to a different incident');
  }
  if (receipt.failure.observationIds.includes(observation.observationId)) {
    return receipt;
  }

  const baselines = receipt.failure.baselines.filter(
    item => item.path !== observation.path
  );
  baselines.push({ path: observation.path, baseline: observation.baseline });
  const affectedPaths = [
    ...new Set([...receipt.failure.affectedPaths, observation.path]),
  ].sort() as ProviderIncidentPath[];
  const httpStatuses = [
    ...new Set([...receipt.failure.httpStatuses, ...observation.httpStatuses]),
  ].sort((left, right) => left - right);

  return seal({
    ...receipt,
    version: receipt.version + 1,
    failure: {
      ...receipt.failure,
      firstObservedAt:
        receipt.failure.firstObservedAt < observation.observedAt
          ? receipt.failure.firstObservedAt
          : observation.observedAt,
      lastObservedAt:
        receipt.failure.lastObservedAt > observation.observedAt
          ? receipt.failure.lastObservedAt
          : observation.observedAt,
      occurrenceCount: receipt.failure.occurrenceCount + 1,
      affectedPaths,
      baselines: baselines.sort((left, right) =>
        left.path.localeCompare(right.path)
      ),
      httpStatuses,
      observationIds: [
        ...receipt.failure.observationIds,
        observation.observationId,
      ].sort(),
    },
  });
}

export function recordProviderIncidentRetry(
  current: unknown,
  input: {
    readonly retryId: string;
    readonly path: ProviderIncidentPath;
    readonly outcome: 'failed' | 'recovered';
    readonly completedAt: string;
    readonly evidenceRef: string;
  }
): ProviderIncidentHandoff {
  const receipt = verifyProviderIncidentHandoff(current);
  const parsed = retryAttemptSchema.omit({ attempt: true }).parse(input);
  const prior = receipt.retryPolicy.attempts.find(
    attempt => attempt.retryId === parsed.retryId
  );
  if (prior) {
    const { attempt: _attempt, ...priorInput } = prior;
    if (canonical(priorInput) !== canonical(parsed)) {
      throw new Error('provider retry id conflicts with its durable receipt');
    }
    return receipt;
  }
  if (!receipt.retryPolicy.transient) {
    throw new Error('provider failure is not transient; retry denied');
  }
  if (receipt.retryPolicy.attempts.length >= receipt.retryPolicy.maxAttempts) {
    throw new Error('provider retry budget exhausted');
  }
  const attempt = {
    ...parsed,
    attempt: receipt.retryPolicy.attempts.length + 1,
  };
  return seal({
    ...receipt,
    version: receipt.version + 1,
    retryPolicy: {
      ...receipt.retryPolicy,
      attempts: [...receipt.retryPolicy.attempts, attempt],
    },
    action: {
      kind: 'bounded_retry',
      completedAt: parsed.completedAt,
      evidenceRef: parsed.evidenceRef,
    },
  });
}

function assertActionMatchesFailure(
  kind: ProviderIncidentActionKind,
  failureClass: ProviderFailureClass
): void {
  const restricted = {
    credential_repair: 'credentials',
    permission_repair: 'permissions',
    spend_authorization: 'spend',
  } as const;
  const requiredClass = restricted[kind as keyof typeof restricted];
  if (requiredClass && requiredClass !== failureClass) {
    throw new Error(`${kind} does not match ${failureClass}`);
  }
}

export function recordProviderIncidentAction(
  current: unknown,
  input: {
    readonly kind: Exclude<
      ProviderIncidentActionKind,
      'bounded_retry' | 'classified'
    >;
    readonly completedAt: string;
    readonly evidenceRef: string;
  }
): ProviderIncidentHandoff {
  const receipt = verifyProviderIncidentHandoff(current);
  const action = providerIncidentHandoffSchema.shape.action.parse(input);
  if (action.kind === 'bounded_retry' || action.kind === 'classified') {
    throw new Error(`${action.kind} is not a remediation action`);
  }
  assertActionMatchesFailure(action.kind, receipt.failure.errorClass);
  return seal({ ...receipt, version: receipt.version + 1, action });
}

export function recordProviderPathVerification(
  current: unknown,
  input: {
    readonly path: ProviderIncidentPath;
    readonly status: 'passed' | 'failed';
    readonly checkedAt: string;
    readonly evidenceRef: string;
  }
): ProviderIncidentHandoff {
  const receipt = verifyProviderIncidentHandoff(current);
  const path = providerIncidentPathSchema.parse(input.path);
  const verification = verificationSchema.parse({
    status: input.status,
    checkedAt: input.checkedAt,
    evidenceRef: input.evidenceRef,
  });
  if (canonical(receipt.verification[path]) === canonical(verification)) {
    return receipt;
  }
  const verifications = { ...receipt.verification, [path]: verification };
  const afterState = expectedAfterState(verifications);
  const action =
    receipt.action.kind === 'classified'
      ? {
          kind: 'provider_health_check' as const,
          completedAt: input.checkedAt,
          evidenceRef: input.evidenceRef,
        }
      : receipt.action;
  return seal({
    ...receipt,
    version: receipt.version + 1,
    action,
    verification: verifications,
    afterState,
    nextOwner: expectedNextOwner(afterState, receipt.escalation),
  });
}

export function verifyProviderIncidentHandoff(
  value: unknown
): ProviderIncidentHandoff {
  const receipt = providerIncidentHandoffSchema.parse(value);
  const expectedFingerprint = incidentFingerprint(receipt.failure.errorClass);
  if (
    receipt.incidentFingerprint !== expectedFingerprint ||
    receipt.idempotencyKey !== `provider-incident:${expectedFingerprint}`
  ) {
    throw new Error('provider incident identity is invalid');
  }
  const transient = receipt.failure.errorClass === 'transient_provider';
  if (
    receipt.retryPolicy.transient !== transient ||
    receipt.retryPolicy.maxAttempts !==
      (transient ? PROVIDER_INCIDENT_MAX_RETRIES : 0) ||
    receipt.retryPolicy.attempts.some(
      (attempt, index) => attempt.attempt !== index + 1
    ) ||
    new Set(receipt.retryPolicy.attempts.map(attempt => attempt.retryId))
      .size !== receipt.retryPolicy.attempts.length
  ) {
    throw new Error('provider retry policy is invalid');
  }
  const expectedEscalation = escalationFor(receipt.failure.errorClass);
  const expectedState = expectedAfterState(receipt.verification);
  assertActionMatchesFailure(receipt.action.kind, receipt.failure.errorClass);
  if (
    canonical(receipt.escalation) !== canonical(expectedEscalation) ||
    receipt.afterState !== expectedState ||
    (expectedState === 'recovered' && receipt.action.kind === 'classified') ||
    receipt.nextOwner !== expectedNextOwner(expectedState, expectedEscalation)
  ) {
    throw new Error('provider handoff routing is invalid');
  }
  const paths = [...receipt.failure.affectedPaths].sort();
  const baselinePaths = receipt.failure.baselines.map(item => item.path).sort();
  if (
    canonical(paths) !== canonical(baselinePaths) ||
    new Set(paths).size !== paths.length ||
    new Set(receipt.failure.observationIds).size !==
      receipt.failure.observationIds.length ||
    receipt.failure.occurrenceCount !== receipt.failure.observationIds.length
  ) {
    throw new Error('provider failure evidence is invalid');
  }
  const { contentDigest, ...unsigned } = receipt;
  if (contentDigest !== digest(unsigned)) {
    throw new Error('provider handoff receipt digest is invalid');
  }
  return receipt;
}
