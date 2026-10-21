import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  admitAssertion,
  type CanonicalAssertion,
  projectAssertion,
} from './assertion';
import type { SemanticContract } from './semantic-contract';

const key = z.string().trim().min(1).max(256);
const timestamp = z.iso.datetime({ offset: true });
const revision = z.number().int().nonnegative().safe();
const eventId = z.string().regex(/^ce_[a-f0-9]{64}$/);
const reasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('publication'),
    baselineAt: timestamp,
    publishedAt: timestamp.nullable(),
    maxObservationDelayMs: z.number().int().positive().safe(),
    edition: z.enum(['original', 'reissue']),
    // Entity existence, not just whether this particular field existed.
    previouslyKnown: z.boolean(),
    identity: z.strictObject({
      expectedArtistId: key,
      observedArtistId: key,
      expectedSourceArtistId: key,
      observedSourceArtistId: key,
    }),
  }),
  ...(
    [
      'availability',
      'discovery',
      'identity_correction',
      'metadata_correction',
      'metric_anomaly',
      'withdrawal',
    ] as const
  ).map(kind => z.strictObject({ kind: z.literal(kind) })),
]);
const changeSchema = z.strictObject({
  tenantId: key,
  observationId: key,
  evidenceRef: z.strictObject({ id: key, revision: key }),
  eventAt: timestamp,
  verification: z.enum(['verified', 'ambiguous', 'rejected', 'unknown']),
  reason: reasonSchema,
  corrects: eventId.nullable(),
  supersedes: z.array(eventId).max(100),
});
const accessSchema = z.strictObject({
  tenantId: key,
  now: timestamp,
  canonicalRevision: revision,
  deleted: z.boolean(),
  policy: z.strictObject({
    id: key,
    revision: key,
    revoked: z.boolean(),
    // Display rights alone never authorize webhook redistribution.
    redistribution: z.enum(['allowed', 'denied', 'unknown']),
  }),
});
type Change = z.infer<typeof changeSchema>;
type ChangeType =
  | 'delayed_observation'
  | 'identity_corrected'
  | 'metadata_changed'
  | 'metric_anomaly'
  | 'new_discovery'
  | 'new_release'
  | 'new_video'
  | 'provider_availability_changed'
  | 'reissue'
  | 'withdrawn_work';

/** Internal intent, not a public payload or authorization to perform an action. */
export interface CanonicalChangeEvent {
  readonly format: 'jovie.canonical-change/v1';
  readonly id: string;
  readonly tenantId: string;
  readonly entity: CanonicalAssertion<unknown>['entity'];
  readonly revisions: {
    readonly before: number | null;
    readonly after: number;
    readonly contract: number;
  };
  readonly observationId: string;
  readonly evidenceRef: { readonly id: string; readonly revision: string };
  readonly source: CanonicalAssertion<unknown>['source'];
  readonly eventAt: string;
  readonly effectiveAt: string | null;
  readonly observedAt: string;
  readonly type: ChangeType;
  readonly changedFields: readonly string[];
  readonly verification: 'verified';
  readonly assurance: CanonicalAssertion<unknown>['quality']['assurance'];
  readonly classification: Change['reason'];
  readonly corrects: string | null;
  readonly supersedes: readonly string[];
  readonly assertion: CanonicalAssertion<unknown>;
}

// JSON property insertion order is not evidence identity. Only JSON values enter
// the digest; source objects are detached before the resulting intent is frozen.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonicalJson(Reflect.get(value, k))}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function classify(
  change: Change,
  assertion: CanonicalAssertion<unknown>,
  hasBefore: boolean
): ChangeType | null {
  const reason = change.reason;
  if (reason.kind === 'publication') {
    const { identity } = reason;
    if (
      identity.expectedArtistId !== identity.observedArtistId ||
      identity.expectedSourceArtistId !== identity.observedSourceArtistId ||
      (reason.publishedAt === null
        ? assertion.effectiveAt !== null
        : assertion.effectiveAt === null ||
          Date.parse(reason.publishedAt) !==
            Date.parse(assertion.effectiveAt)) ||
      (reason.publishedAt !== null &&
        Date.parse(reason.publishedAt) > Date.parse(assertion.observedAt))
    )
      return null;
    if (reason.edition === 'reissue') return 'reissue';
    if (hasBefore) return 'metadata_changed';
    if (
      reason.previouslyKnown ||
      reason.publishedAt === null ||
      Date.parse(reason.publishedAt) <= Date.parse(reason.baselineAt)
    )
      return 'new_discovery';
    if (
      Date.parse(assertion.observedAt) - Date.parse(reason.publishedAt) >
      reason.maxObservationDelayMs
    )
      return 'delayed_observation';
    if (assertion.entity.kind === 'release') return 'new_release';
    if (assertion.entity.kind === 'video') return 'new_video';
    return 'new_discovery';
  }
  if (reason.kind === 'discovery')
    return hasBefore ? 'metadata_changed' : 'new_discovery';
  if (!hasBefore) return null;
  switch (reason.kind) {
    case 'availability':
      return 'provider_availability_changed';
    case 'identity_correction':
      return change.corrects ? 'identity_corrected' : null;
    case 'metadata_correction':
      return change.corrects ? 'metadata_changed' : null;
    case 'metric_anomaly':
      return 'metric_anomaly';
    case 'withdrawal':
      return 'withdrawn_work';
    default:
      return null;
  }
}

/**
 * One field change at a canonical writer boundary. The caller supplies persisted
 * before/after revisions, the fixed commit time, verified identity evidence and
 * freshly loaded tenant/policy state. Never bind these arguments to request
 * input. Admission does not commit, deliver, enroll monitoring or create links.
 * The existing transaction/outbox owner must persist the intent with its write.
 */
export function admitCanonicalChange<T>(
  contract: SemanticContract<T>,
  input: {
    readonly before: {
      readonly raw: unknown;
      readonly context: unknown;
    } | null;
    readonly after: { readonly raw: unknown; readonly context: unknown };
    readonly change: unknown;
    readonly access: unknown;
  }
): CanonicalChangeEvent | null {
  const parsed = changeSchema.safeParse(input.change);
  if (!parsed.success) throw new TypeError('Invalid canonical change context');
  const change = parsed.data;
  const after = admitAssertion(contract, input.after.raw, input.after.context);
  const before = input.before
    ? admitAssertion(contract, input.before.raw, input.before.context)
    : null;
  if (
    Date.parse(change.eventAt) < Date.parse(after.observedAt) ||
    new Set(change.supersedes).size !== change.supersedes.length ||
    (change.corrects !== null && !change.supersedes.includes(change.corrects))
  )
    throw new TypeError('Invalid canonical change chronology or lineage');
  const access = accessSchema.safeParse(input.access);
  if (
    access.success &&
    Date.parse(change.eventAt) > Date.parse(access.data.now)
  )
    throw new TypeError('Invalid canonical change commit time');
  if (
    change.verification !== 'verified' ||
    after.decision.status !== 'accepted' ||
    after.polarity !== 'positive' ||
    after.quality.health !== 'healthy' ||
    after.quality.freshness !== 'current' ||
    !z.json().safeParse(after.decision.canonical).success ||
    ((change.corrects !== null || change.supersedes.length > 0) &&
      (!before ||
        change.reason.kind === 'publication' ||
        change.reason.kind === 'discovery'))
  )
    return null;
  if (
    before &&
    (before.decision.status !== 'accepted' ||
      before.polarity !== 'positive' ||
      before.entity.id !== after.entity.id ||
      before.entity.kind !== after.entity.kind ||
      before.revisions.canonical >= after.revisions.canonical ||
      (change.supersedes.length === 0 &&
        canonicalJson(before.decision.canonical) ===
          canonicalJson(after.decision.canonical)))
  )
    return null;
  const type = classify(change, after, before !== null);
  if (!type) return null;
  const facts = {
    format: 'jovie.canonical-change/v1' as const,
    tenantId: change.tenantId,
    entity: after.entity,
    revisions: {
      before: before?.revisions.canonical ?? null,
      after: after.revisions.canonical,
      contract: after.revisions.contract,
    },
    observationId: change.observationId,
    evidenceRef: change.evidenceRef,
    source: after.source,
    eventAt: change.eventAt,
    effectiveAt: after.effectiveAt,
    observedAt: after.observedAt,
    type,
    changedFields: [after.predicate],
    verification: 'verified' as const,
    assurance: after.quality.assurance,
    classification: change.reason,
    corrects: change.corrects,
    supersedes: [...change.supersedes].sort(),
    assertion: after,
  };
  const event = { ...facts, id: `ce_${digest(facts)}` };
  if (!projectCanonicalChange(event, input.access)) return null;
  return freeze(structuredClone(event));
}

/**
 * Re-run for every delivery/replay with current server-derived policy, deletion,
 * tenant and canonical revision. Display permission is insufficient for egress.
 * Internal source records/URIs, raw observations and producer details never leave
 * this boundary. Opaque evidence references support authorized receipt lookup.
 * This result grants no Story Engine, publishing, messaging or spend authority.
 */
export function projectCanonicalChange(
  event: CanonicalChangeEvent,
  currentAccess: unknown
) {
  const parsed = accessSchema.safeParse(currentAccess);
  if (!parsed.success) return null;
  const access = parsed.data;
  const { id, ...facts } = event;
  if (
    id !== `ce_${digest(facts)}` ||
    access.tenantId !== event.tenantId ||
    access.canonicalRevision !== event.revisions.after ||
    access.policy.redistribution !== 'allowed' ||
    Date.parse(access.now) < Date.parse(event.eventAt)
  )
    return null;
  const { redistribution: _redistribution, ...policy } = access.policy;
  const payload = projectAssertion(event.assertion, {
    audience: { kind: 'public' },
    now: access.now,
    deleted: access.deleted,
    policy,
  });
  if (!payload) return null;
  return freeze(
    structuredClone({
      format: event.format,
      id: event.id,
      tenantId: event.tenantId,
      entity: event.entity,
      revisions: event.revisions,
      observationRef: `evidence_${digest({ source: event.source, observationId: event.observationId, evidenceRef: event.evidenceRef })}`,
      eventAt: event.eventAt,
      effectiveAt: event.effectiveAt,
      observedAt: event.observedAt,
      type: event.type,
      changedFields: event.changedFields,
      verification: event.verification,
      confidence: event.assurance.confidence,
      calibrationRef: event.assurance.calibration
        ? `evidence_${digest(event.assurance.calibration)}`
        : null,
      corrects: event.corrects,
      supersedes: event.supersedes,
      payload: { predicate: payload.predicate, value: payload.value },
    })
  );
}
