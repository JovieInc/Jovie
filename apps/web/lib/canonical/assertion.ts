/** Revisioned evidence admission; persistence and winner selection are separate concerns. */
import { z } from 'zod';
import type { AdmissionDecision, SemanticContract } from './semantic-contract';

const key = z
  .string()
  .min(1)
  .max(256)
  .refine(value => value.trim().length > 0);
const revision = z.number().int().nonnegative().safe();
const permission = z.enum(['allowed', 'denied', 'unknown']);
const reference = z.strictObject({ id: key, revision: key });
const assurance = z.union([
  z.strictObject({ confidence: z.null(), calibration: z.null() }),
  z.strictObject({
    confidence: z.number().min(0).max(1),
    calibration: reference,
  }),
]);

const contextSchema = z.strictObject({
  entity: z.strictObject({
    kind: key,
    id: key,
  }),
  predicate: key,
  polarity: z.enum(['positive', 'negative']),
  source: z.strictObject({
    id: key,
    recordId: key,
    uri: z
      .url()
      .max(2048)
      .refine(value => {
        const url = new URL(value);
        return !url.username && !url.password;
      }),
    revision: key,
  }),
  observedAt: z.iso.datetime({ offset: true }),
  effectiveAt: z.iso.datetime({ offset: true }).nullable(),
  producer: z.strictObject({ id: key, version: key }),
  revisions: z.strictObject({
    contract: revision.positive(),
    canonical: revision,
  }),
  quality: z.strictObject({
    assurance,
    health: z.enum(['healthy', 'unavailable', 'unknown']),
    freshness: z.enum(['current', 'stale', 'unknown']),
    completeness: z.number().min(0).max(1).nullable(),
  }),
  scope: z.discriminatedUnion('visibility', [
    z.strictObject({ visibility: z.literal('public'), tenantId: z.null() }),
    z.strictObject({ visibility: z.literal('private'), tenantId: key }),
  ]),
  // A reviewed field-specific grant is supplied by the existing source policy owner.
  // Unknown storage rights cannot retain even quarantined raw evidence.
  rights: z.strictObject({
    policyId: key,
    revision: key,
    storage: z.literal('allowed'),
    publicDisplay: permission,
    privateDisplay: permission,
    retainUntil: z.iso.datetime({ offset: true }).nullable(),
  }),
});

export type AssertionContext = z.infer<typeof contextSchema>;
export type CanonicalAssertion<T> = AssertionContext & {
  readonly format: 'jovie.canonical-assertion/v1';
  readonly value: z.infer<ReturnType<typeof z.json>>;
  readonly decision: AdmissionDecision<T>;
};

/**
 * Reuse the field contract; accepted means valid evidence, never identity,
 * ownership, merge authority or the winning canonical revision. Negative and
 * contradictory observations remain distinct. No I/O, inferred grants or clocks.
 */
export function admitAssertion<T>(
  contract: SemanticContract<T>,
  raw: unknown,
  context: unknown
): CanonicalAssertion<T> {
  const parsed = contextSchema.safeParse(context);
  const value = z.json().safeParse(raw);
  if (
    !parsed.success ||
    !value.success ||
    parsed.data.predicate !== contract.field ||
    parsed.data.revisions.contract !== contract.version
  ) {
    // Do not include private observations or source records in error messages.
    throw new TypeError('Invalid canonical assertion context or value');
  }
  const input = parsed.data;
  return {
    ...input,
    format: 'jovie.canonical-assertion/v1',
    value: value.data,
    decision: contract.admit(value.data, {
      producer: `${input.producer.id}@${input.producer.version}`,
      source: input.source.id,
    }),
  };
}

const projectionSchema = z.strictObject({
  audience: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('public') }),
    z.strictObject({ kind: z.literal('private'), tenantId: key }),
  ]),
  now: z.iso.datetime({ offset: true }),
  deleted: z.boolean(),
  policy: reference.extend({ revoked: z.boolean() }),
});

/**
 * The caller supplies freshly loaded policy/deletion state and authenticated
 * tenant scope. This is a projection guard, not authentication or physical
 * erasure. Only admitted values and interpretation leave this boundary;
 * source records, URIs, raw values and private provenance never do.
 */
export function projectAssertion<T>(
  assertion: CanonicalAssertion<T>,
  access: unknown
) {
  const parsed = projectionSchema.safeParse(access);
  if (!parsed.success) return null;
  const { audience, now, deleted, policy } = parsed.data;
  const { rights, scope, decision } = assertion;
  if (
    deleted ||
    policy.revoked ||
    policy.id !== rights.policyId ||
    policy.revision !== rights.revision ||
    decision.status !== 'accepted' ||
    decision.canonical === undefined ||
    (rights.retainUntil !== null &&
      Date.parse(rights.retainUntil) <= Date.parse(now))
  )
    return null;
  if (audience.kind === 'public') {
    if (scope.visibility !== 'public' || rights.publicDisplay !== 'allowed')
      return null;
  } else if (
    rights.privateDisplay !== 'allowed' ||
    (scope.visibility === 'private' && scope.tenantId !== audience.tenantId)
  )
    return null;
  return {
    entity: { ...assertion.entity },
    predicate: assertion.predicate,
    polarity: assertion.polarity,
    value: structuredClone(decision.canonical),
    observedAt: assertion.observedAt,
    effectiveAt: assertion.effectiveAt,
    revisions: { ...assertion.revisions },
  };
}
