import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SummerCardInput } from './summer-cards';

export const SPEND_PREFLIGHT_SCHEMA = 'jovie.spend-preflight/v1' as const;
export const SPEND_OUTCOME_SCHEMA =
  'jovie.cost-value.spend-outcome/v1' as const;

const httpsUrl = z.url({ protocol: /^https$/u }).max(2048);
const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.number().finite().nonnegative().max(1_000_000_000);
const ownedChecks = [
  'included-seats-agents',
  'credits',
  'free-quotas',
  'cached-internal-data',
  'authorized-accounts',
] as const;

const routeSchema = z
  .object({
    id: text(80),
    kind: z.enum(['owned', 'free', 'build', 'paid']),
    vendor: text(120),
    vendorProduct: text(120),
    available: z.boolean(),
    coversOutcome: z.boolean(),
    reason: text(500),
    terms: z.object({
      status: z.enum([
        'compatible',
        'incompatible',
        'not-applicable',
        'unverified',
      ]),
      summary: text(500),
      sourceRef: httpsUrl,
      checkedAt: z.string().datetime({ offset: true }),
    }),
    requestedChargeUsd: money,
    hardMaximumExposureUsd: money,
    fullyLoadedCostUsd: money.nullable(),
    costValueReceiptRef: httpsUrl.nullable(),
    timeToAnswerMinutes: z.number().int().nonnegative().max(525_600),
    autoRenews: z.boolean(),
    overagePossible: z.boolean(),
    renewalBehavior: text(300),
    overageBehavior: text(300),
    cancellationPath: text(300),
    paymentCredentialAction: z.enum([
      'none',
      'use-authorized-credential',
      'founder-details-required',
      'temporary-card-required',
      'accept-new-paid-terms',
    ]),
  })
  .refine(route => route.hardMaximumExposureUsd >= route.requestedChargeUsd, {
    message: 'hard maximum must cover the requested charge',
  })
  .refine(
    route => route.fullyLoadedCostUsd === null || route.costValueReceiptRef,
    {
      message: 'priced routes require a cost/value receipt',
    }
  );

export const spendIntentRequestSchema = z
  .object({
    kind: z.literal('spend-intent'),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
    product: z.enum(['jov', 'lyb', 'company']),
    issue: z.string().regex(/^JOV-\d+$/u),
    issueUrl: httpsUrl,
    outcome: text(800),
    expectedDurableOutcome: text(800),
    stopCondition: text(500),
    owner: text(120),
    decidedAt: z.string().datetime({ offset: true }),
    ownedCapacitySearch: z.object({
      inventoryRef: httpsUrl,
      checkedAt: z.string().datetime({ offset: true }),
      checked: z.array(z.enum(ownedChecks)).length(ownedChecks.length),
      summary: text(800),
    }),
    alternatives: z.array(routeSchema).min(4).max(16),
    preAuthorizedEnvelope: z
      .object({
        sourceRef: httpsUrl,
        validUntil: z.string().datetime({ offset: true }),
        vendor: text(120),
        vendorProduct: text(120),
        maximumExposureUsd: money,
        allowedPaymentCredentialActions: z
          .array(routeSchema.shape.paymentCredentialAction)
          .min(1),
        allowsAutoRenew: z.boolean(),
        allowsOverage: z.boolean(),
      })
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    input =>
      ['owned', 'free', 'build', 'paid'].every(kind =>
        input.alternatives.some(route => route.kind === kind)
      ),
    { message: 'alternatives must include owned, free, build, and paid routes' }
  )
  .refine(
    input =>
      new Set(input.ownedCapacitySearch.checked).size === ownedChecks.length,
    { message: 'every owned-capacity class must be checked' }
  )
  .refine(
    input =>
      Date.parse(input.ownedCapacitySearch.checkedAt) <=
      Date.parse(input.decidedAt),
    { message: 'owned capacity must be checked before the decision' }
  );

export type SpendIntentRequest = z.infer<typeof spendIntentRequestSchema>;
type SpendRoute = SpendIntentRequest['alternatives'][number];
function receiptId(prefix: 'spf' | 'spo', key: string): string {
  return `${prefix}_${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

function validRoute(route: SpendRoute, decidedAt: string): boolean {
  return (
    route.available &&
    route.coversOutcome &&
    Date.parse(route.terms.checkedAt) <= Date.parse(decidedAt) &&
    (route.terms.status === 'compatible' ||
      route.terms.status === 'not-applicable')
  );
}

function envelopeCovers(input: SpendIntentRequest, route: SpendRoute): boolean {
  const envelope = input.preAuthorizedEnvelope;
  return Boolean(
    envelope &&
      Date.parse(input.decidedAt) < Date.parse(envelope.validUntil) &&
      envelope.vendor === route.vendor &&
      envelope.vendorProduct === route.vendorProduct &&
      route.hardMaximumExposureUsd <= envelope.maximumExposureUsd &&
      envelope.allowedPaymentCredentialActions.includes(
        route.paymentCredentialAction
      ) &&
      (!route.autoRenews || envelope.allowsAutoRenew) &&
      (!route.overagePossible || envelope.allowsOverage)
  );
}

function approvalCard(
  input: SpendIntentRequest,
  id: string,
  route: SpendRoute
): SummerCardInput {
  const alternatives = input.alternatives
    .filter(item => item.id !== route.id)
    .map(item => `${item.vendor} ${item.vendorProduct}: ${item.reason}`)
    .join('\n');
  return {
    idempotencyKey: input.idempotencyKey,
    kind: 'spend',
    product: input.product,
    title: `Approve ${route.vendor} ${route.vendorProduct}`,
    body: [
      `Use case: ${input.outcome} (${input.issue})`,
      `Alternatives checked:\n${alternatives}`,
      `Owned/free capacity insufficient: ${input.ownedCapacitySearch.summary}`,
      `Terms/licensing/privacy: ${route.terms.summary}`,
      `Charge: $${route.requestedChargeUsd}; hard maximum: $${route.hardMaximumExposureUsd}`,
      `Renewal: ${route.renewalBehavior}`,
      `Overage: ${route.overageBehavior}`,
      `Cancellation/cleanup: ${route.cancellationPath}`,
      `Payment action: ${route.paymentCredentialAction}`,
      `Expected outcome: ${input.expectedDurableOutcome}`,
      `Stop condition: ${input.stopCondition}`,
      `Owner: ${input.owner}`,
    ].join('\n\n'),
    recommendation: `Approve only ${route.vendor} ${route.vendorProduct} up to $${route.hardMaximumExposureUsd}.`,
    defaultIfSilent:
      'Do not purchase; hold the experiment at its stop condition.',
    recipient: 'Tim',
    amountUsd: route.hardMaximumExposureUsd,
    evidence: [
      ...new Set([
        input.issueUrl,
        input.ownedCapacitySearch.inventoryRef,
        route.terms.sourceRef,
        ...(route.costValueReceiptRef ? [route.costValueReceiptRef] : []),
      ]),
    ].slice(0, 16),
    preflightReceiptId: id,
  };
}

export function evaluateSpendIntent(input: SpendIntentRequest) {
  const id = receiptId('spf', input.idempotencyKey);
  const valid = input.alternatives.filter(route =>
    validRoute(route, input.decidedAt)
  );
  let selected: SpendRoute | null = null;
  let disposition = 'blocked';
  let reason =
    'No available outcome-complete route has compatible verified terms.';

  if (valid.length === 1) {
    [selected] = valid;
  } else if (
    valid.length > 1 &&
    valid.every(route => route.fullyLoadedCostUsd !== null)
  ) {
    [selected] = [...valid].sort(
      (a, b) =>
        (a.fullyLoadedCostUsd ?? 0) - (b.fullyLoadedCostUsd ?? 0) ||
        a.hardMaximumExposureUsd - b.hardMaximumExposureUsd ||
        a.timeToAnswerMinutes - b.timeToAnswerMinutes ||
        a.id.localeCompare(b.id)
    );
  } else if (valid.length > 1) {
    reason = 'Valid alternatives have incomparable fully loaded cost receipts.';
  }

  if (selected?.kind === 'owned') {
    disposition = 'use-owned-capacity';
    reason = 'Owned capacity is the cheapest valid route.';
  } else if (selected && selected.kind !== 'paid') {
    disposition = 'use-valid-alternative';
    reason = 'A valid owned/free/build route avoids new spend.';
  } else if (selected && envelopeCovers(input, selected)) {
    disposition = 'autonomous-within-envelope';
    reason =
      'The minimum valid experiment fits an exact pre-authorized envelope.';
  } else if (selected) {
    disposition = 'request-founder-approval';
    reason =
      'The minimum valid paid experiment is outside delegated authority.';
  }

  return {
    schema: SPEND_PREFLIGHT_SCHEMA,
    id,
    request: input,
    disposition,
    reason,
    selectedRoute: selected,
    approvalCard:
      disposition === 'request-founder-approval' && selected
        ? approvalCard(input, id, selected)
        : null,
  };
}

export const spendOutcomeRequestSchema = z
  .object({
    kind: z.literal('spend-outcome'),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
    preflightReceiptId: z.string().regex(/^spf_[0-9a-f]{32}$/u),
    observedAt: z.string().datetime({ offset: true }),
    predicted: z.object({
      cashCostUsd: money,
      timeSavedMinutes: z.number().nonnegative(),
    }),
    actual: z.object({
      cashCostUsd: money,
      timeSavedMinutes: z.number().nonnegative(),
    }),
    usefulOrCertifiedOutcome: text(800),
    outcomeRef: httpsUrl.nullable(),
    reuseValue: text(500),
    retentionDecision: z.enum(['retain', 'cancel', 'one-off-complete']),
    inventoryDisposition: z.enum(['add', 'update', 'none']),
    entitlement: z
      .object({
        vendor: text(120),
        vendorProduct: text(120),
        capability: text(300),
        sourceRef: httpsUrl,
      })
      .nullable(),
  })
  .strict()
  .refine(input => input.inventoryDisposition === 'none' || input.entitlement, {
    message: 'inventory updates require entitlement evidence',
  });

export function buildSpendOutcomeReceipt(
  input: z.infer<typeof spendOutcomeRequestSchema>
) {
  return {
    schema: SPEND_OUTCOME_SCHEMA,
    id: receiptId('spo', input.idempotencyKey),
    ...input,
    subscriptionCapabilityObservation:
      input.inventoryDisposition === 'none'
        ? null
        : { disposition: input.inventoryDisposition, ...input.entitlement! },
  };
}
