import { z } from 'zod';

export const SUPPORT_MATRIX_VERSION = 'jovie.commerce-support/v1';
export const EVIDENCE_VERSION = 'jovie.commerce-evidence/v1';
export const COMMERCE_CLASSES = [
  'ancillary_subscription',
  'api_mcp_service',
  'artist_visibility_pro',
  'creator_payments',
  'disabled_usage_billing',
  'enterprise_handoff',
  'external_store_merch',
  'hosted_creator_merch',
  'legacy_offer',
  'one_time_service',
] as const;
export const CHANNELS = [
  'acpCheckout',
  'acpDiscovery',
  'chatgptPlugin',
  'spt',
  'stripeDistribution',
] as const;
const text = z.string().trim().min(1);
const date = z.iso.date();
const source = z.strictObject({ path: text, selector: text });
const state = z.enum([
  'supported',
  'unsupported',
  'partner_gated',
  'UNKNOWN',
  'not_applicable',
]);
const owner = z.enum(['jovie', 'creator', 'external_merchant', 'printful']);
// An explicit absence of policy is a blocker with an accountable resolution owner.
// It is never a merchant assignment and can never back a supported channel.
const responsibility = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('assigned'), owner, basis: source }),
  z.strictObject({
    state: z.literal('blocked'),
    resolutionOwner: owner,
    issue: text.regex(/^JOV-\d+$/),
    reason: text,
  }),
  z.strictObject({ state: z.literal('not_applicable'), reason: text }),
]);
const channel = z.strictObject({
  state,
  evidenceIds: z.array(text).min(1),
  reason: text,
});
export const platformEvidenceSchema = z.strictObject({
  version: z.literal(EVIDENCE_VERSION),
  id: text,
  provider: z.enum(['openai', 'stripe']),
  channel: z.enum(CHANNELS),
  url: z.url(),
  observedAt: date,
  recheckAt: date,
  finding: state,
  claim: text,
  termsOrAccessConstraints: z.array(text).min(1),
  uncertainty: text,
  geographicLimits: text,
});
const stripeIdentity = z.strictObject({
  kind: z.enum([
    'configured_prices',
    'payment_link',
    'inline_price_data',
    'none',
  ]),
  source,
  // Product IDs are not in local price mappings; do not manufacture them.
  prices: z.array(
    z.strictObject({
      priceId: text.regex(/^price_/),
      amountCents: z.number().int().nonnegative(),
      currency: text,
      interval: z.enum(['month', 'year']),
      legacy: z.boolean(),
    })
  ),
  productId: z.null(),
  limitation: text,
});
const row = z.strictObject({
  commerceClass: z.enum(COMMERCE_CLASSES),
  identity: z.strictObject({
    kind: z.enum(['offer', 'capability']),
    id: text,
    source,
  }),
  offerType: z.enum([
    'subscription',
    'service',
    'physical_goods',
    'payment',
    'usage',
    'capability',
    'sales_handoff',
  ]),
  ownership: z.strictObject({
    merchantOfRecord: responsibility,
    sellerOrBeneficiary: responsibility,
    fulfillment: responsibility,
    refund: responsibility,
    support: responsibility,
  }),
  stripe: stripeIdentity,
  channels: z.strictObject({
    acpCheckout: channel,
    acpDiscovery: channel,
    chatgptPlugin: channel,
    spt: channel,
    stripeDistribution: channel,
  }),
  runtime: z.strictObject({
    price: z.strictObject({
      source,
      amountCents: z.number().int().nonnegative().nullable(),
      currency: text.nullable(),
      interval: z.enum(['month', 'year']).nullable(),
    }),
    featureFlag: z.strictObject({
      source,
      name: text.nullable(),
      defaultValue: z.boolean().nullable(),
      evaluation: z.enum(['per_request', 'source_disabled', 'not_applicable']),
    }),
    connect: source,
    fulfillment: source,
    entitlement: source,
  }),
  webFallback: z.strictObject({
    state: z.enum([
      'handoff',
      'runtime_gated',
      'none',
      'existing_subscribers_only',
    ]),
    source,
  }),
  requirements: z.strictObject({
    claim: z.array(text).min(1),
    approval: z.array(text).min(1),
  }),
  evidenceObservedAt: date,
  geographicLimits: text,
  availability: z.enum([
    'runtime_gated',
    'handoff',
    'planned',
    'disabled',
    'legacy',
    'blocked',
  ]),
  reEvaluationTrigger: text,
});
export const supportMatrixSchema = z.strictObject({
  version: z.literal(SUPPORT_MATRIX_VERSION),
  sourceObservedAt: date,
  evidence: z.array(platformEvidenceSchema).min(1),
  rows: z.array(row).min(1),
});
export type SupportMatrix = z.infer<typeof supportMatrixSchema>;
export type SupportRow = SupportMatrix['rows'][number];
export type PlatformEvidence = z.infer<typeof platformEvidenceSchema>;

/** Validate untrusted/serialized input at consumption time, using the real clock. */
export function validateSupportMatrix(
  input: unknown,
  now = new Date()
): SupportMatrix {
  const matrix = supportMatrixSchema.parse(input);
  if (!Number.isFinite(now.getTime()))
    throw new Error('Invalid validation clock');
  const today = now.toISOString().slice(0, 10);
  function fail(message: string): never {
    throw new Error(`Invalid commerce support matrix: ${message}`);
  }
  if (matrix.sourceObservedAt > today) fail('future source observation');
  const evidence = new Map<string, PlatformEvidence>();
  for (const receipt of matrix.evidence) {
    if (evidence.has(receipt.id)) fail(`duplicate receipt ${receipt.id}`);
    const url = new URL(receipt.url);
    const host =
      receipt.provider === 'openai'
        ? 'developers.openai.com'
        : 'docs.stripe.com';
    if (
      url.protocol !== 'https:' ||
      url.hostname !== host ||
      url.username ||
      url.password
    )
      fail(`receipt ${receipt.id} must use a first-party documentation URL`);
    const expectedProvider =
      receipt.channel === 'spt' || receipt.channel === 'stripeDistribution'
        ? 'stripe'
        : 'openai';
    if (receipt.provider !== expectedProvider)
      fail(`wrong provider for ${receipt.channel}`);
    if (receipt.observedAt > today || receipt.recheckAt <= receipt.observedAt)
      fail(`invalid evidence dates for ${receipt.id}`);
    evidence.set(receipt.id, receipt);
  }
  const classes = new Set<string>();
  for (const entry of matrix.rows) {
    if (classes.has(entry.commerceClass))
      fail(`duplicate class ${entry.commerceClass}`);
    classes.add(entry.commerceClass);
    if (entry.evidenceObservedAt > matrix.sourceObservedAt)
      fail(`future row evidence for ${entry.commerceClass}`);
    if (
      Object.values(entry.ownership).some(role => role.state === 'blocked') &&
      entry.availability !== 'blocked'
    )
      fail(`unresolved ownership must block ${entry.commerceClass}`);
    const supported = CHANNELS.some(
      key => entry.channels[key].state === 'supported'
    );
    if (supported) {
      if (
        entry.availability !== 'runtime_gated' ||
        entry.stripe.kind === 'none' ||
        entry.commerceClass === 'legacy_offer' ||
        entry.stripe.prices.some(price => price.legacy) ||
        (entry.stripe.kind === 'configured_prices' &&
          entry.stripe.prices.length === 0)
      )
        fail(`non-sellable class ${entry.commerceClass} cannot be supported`);
      if (
        today >
        new Date(Date.parse(matrix.sourceObservedAt) + 30 * 86400000)
          .toISOString()
          .slice(0, 10)
      )
        fail('stale repository source evidence represented as supported');
      if (
        Object.values(entry.ownership).some(role => role.state !== 'assigned')
      )
        fail(`ambiguous required ownership for ${entry.commerceClass}`);
    }
    for (const key of CHANNELS) {
      const claim = entry.channels[key];
      for (const id of claim.evidenceIds) {
        const receipt = evidence.get(id);
        if (!receipt) fail(`missing receipt ${id}`);
        if (receipt.channel !== key)
          fail(`receipt ${id} does not cover ${key}`);
        if (
          claim.state === 'supported' &&
          (receipt.finding !== 'supported' ||
            receipt.recheckAt <= today ||
            Date.parse(today) - Date.parse(receipt.observedAt) >=
              30 * 86400000 ||
            receipt.observedAt < entry.evidenceObservedAt)
        )
          fail(`unsupported or stale evidence ${id} represented as supported`);
      }
    }
  }
  for (const required of COMMERCE_CLASSES) {
    if (!classes.has(required)) fail(`missing commerce class ${required}`);
  }
  return matrix;
}
