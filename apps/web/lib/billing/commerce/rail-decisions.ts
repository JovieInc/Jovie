import { z } from 'zod';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  getPlanSignupHref,
} from '../offer-truth';
import {
  type AccessEvidence,
  type Capability,
  evaluateProviderAccess,
  evidenceDigest,
  importProviderAccess,
} from './provider-access';

export const RAIL_DECISION_VERSION = 'jovie.commerce-rail-decisions/v1';
const text = z.string().trim().min(1);
const MAX_SOURCE_AGE_MS = 30 * 24 * 60 * 60_000;
const state = z.enum([
  'supported',
  'unsupported',
  'partner_gated',
  'UNKNOWN',
  'not_applicable',
]);
const responsibility = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('assigned'),
    owner: z.enum(['jovie', 'creator', 'external_merchant', 'printful']),
  }),
  z.object({ state: z.literal('blocked') }),
  z.object({ state: z.literal('not_applicable') }),
]);
// Consumption projection of the JOV-8214 serialized matrix, not another catalog.
// Its producer retains full source/ownership/platform validation responsibility.
const matrixProjection = z.object({
  version: z.literal('jovie.commerce-support/v1'),
  sourceObservedAt: z.iso.date(),
  rows: z
    .array(
      z.object({
        commerceClass: text,
        identity: z.object({ id: text }),
        evidenceObservedAt: z.iso.date(),
        offerType: text,
        ownership: z.object({
          merchantOfRecord: responsibility,
          sellerOrBeneficiary: responsibility,
          fulfillment: responsibility,
          refund: responsibility,
          support: responsibility,
        }),
        stripe: z.object({
          kind: z.enum([
            'configured_prices',
            'payment_link',
            'inline_price_data',
            'none',
          ]),
          prices: z.array(
            z.object({
              priceId: text,
              amountCents: z.number().int().nonnegative(),
              currency: text,
              interval: z.enum(['month', 'year']),
              legacy: z.boolean(),
            })
          ),
        }),
        channels: z.object({
          acpCheckout: z.object({ state }),
          acpDiscovery: z.object({ state }),
          chatgptPlugin: z.object({ state }),
          spt: z.object({ state }),
          stripeDistribution: z.object({ state }),
        }),
        runtime: z.object({
          price: z.object({
            amountCents: z.number().nullable(),
            currency: text.nullable(),
            interval: text.nullable(),
          }),
          featureFlag: z.object({
            evaluation: z.enum([
              'per_request',
              'source_disabled',
              'not_applicable',
            ]),
          }),
        }),
        webFallback: z.object({
          state: z.enum([
            'handoff',
            'runtime_gated',
            'none',
            'existing_subscribers_only',
          ]),
        }),
        availability: z.enum([
          'runtime_gated',
          'handoff',
          'planned',
          'disabled',
          'legacy',
          'blocked',
        ]),
        requirements: z.object({
          claim: z.array(text).min(1),
          approval: z.array(text).min(1),
        }),
        reEvaluationTrigger: text,
      })
    )
    .min(1)
    .max(64),
});
type Row = z.infer<typeof matrixProjection>['rows'][number];
export const providerAccountsSchema = z.strictObject({
  openai: text.nullable(),
  stripe: text.nullable(),
});
type Accounts = z.infer<typeof providerAccountsSchema>;
const ALTERNATIVES = [
  ['acp', 'openai', 'acpCheckout'],
  ['acs', 'stripe', 'stripeDistribution'],
  ['mpp', 'stripe', 'stripeDistribution'],
  ['plugin-subscription-checkout', 'openai', 'chatgptPlugin'],
  ['projects', 'stripe', 'stripeDistribution'],
  ['spt', 'stripe', 'spt'],
] as const;

function access(
  evidence: AccessEvidence,
  accounts: Accounts,
  capability: Capability,
  now: Date
) {
  const provider =
    capability === 'acp' || capability === 'plugin-subscription-checkout'
      ? 'openai'
      : 'stripe';
  return evaluateProviderAccess(
    evidence,
    { provider, account: accounts[provider], capability },
    now
  );
}

function selectRow(
  row: Row,
  evidence: AccessEvidence,
  accounts: Accounts,
  now: Date,
  matrixCurrent: boolean
) {
  const blockers: string[] = [];
  const rowAge = now.getTime() - Date.parse(row.evidenceObservedAt);
  if (!matrixCurrent || rowAge < 0 || rowAge >= MAX_SOURCE_AGE_MS)
    blockers.push('matrix-source-stale-or-future');
  if (row.availability !== 'runtime_gated')
    blockers.push(`offer-${row.availability}`);
  if (Object.values(row.ownership).some(owner => owner.state !== 'assigned'))
    blockers.push('ownership-unresolved');
  if (row.webFallback.state !== 'runtime_gated')
    blockers.push('web-checkout-unavailable');
  if (row.runtime.featureFlag.evaluation !== 'not_applicable')
    blockers.push('runtime-gate-unverified');
  const canonical = ARTIST_VISIBILITY_OFFER.pro;
  if (
    row.commerceClass !== 'artist_visibility_pro' ||
    row.identity.id !== ARTIST_VISIBILITY_OFFER_CONTRACT_ID ||
    row.offerType !== 'subscription' ||
    row.runtime.price.amountCents !== toCents(canonical.monthlyUsd) ||
    row.runtime.price.currency !== canonical.currency ||
    row.runtime.price.interval !== canonical.interval ||
    Object.values(row.ownership).some(
      owner => owner.state !== 'assigned' || owner.owner !== 'jovie'
    )
  )
    blockers.push('canonical-offer-not-certified');
  const checkout = access(evidence, accounts, 'ordinary-web-checkout', now);
  if (checkout.result !== 'GRANTED')
    blockers.push(`web-access-${checkout.result}`);
  const skuObservations = row.stripe.prices
    .filter(price => !price.legacy)
    .sort((a, b) => a.priceId.localeCompare(b.priceId, 'en'))
    .map(price => ({
      price,
      access: evaluateProviderAccess(
        evidence,
        {
          provider: 'stripe',
          account: accounts.stripe,
          capability: 'active-sku',
          resource: price.priceId,
        },
        now
      ),
    }));
  const activeSku =
    row.stripe.kind === 'configured_prices'
      ? skuObservations.find(({ price, access: observation }) => {
          const sku = observation.sku;
          return (
            observation.result === 'GRANTED' &&
            sku?.active &&
            sku.productActive &&
            sku.priceId === price.priceId &&
            sku.amountCents === price.amountCents &&
            sku.currency === price.currency &&
            sku.interval === price.interval &&
            price.amountCents === row.runtime.price.amountCents &&
            price.currency === row.runtime.price.currency &&
            price.interval === row.runtime.price.interval
          );
        })
      : undefined;
  if (!activeSku) blockers.push('active-canonical-sku-unverified');
  const rejectedAlternatives: Array<{
    rail: string;
    reasons: string[];
    access: string;
  }> = ALTERNATIVES.map(([rail, , channel]) => ({
    rail,
    reasons: [
      `matrix-${row.channels[channel].state}`,
      rail === 'plugin-subscription-checkout' &&
      row.offerType === 'subscription'
        ? 'unsupported-plugin-subscription-checkout'
        : 'no-certified-checkout-adapter',
    ],
    access: access(evidence, accounts, rail, now).result,
  }));
  const selected = blockers.length === 0;
  if (!selected)
    rejectedAlternatives.push({
      rail: 'ordinary-web-checkout',
      reasons: blockers,
      access: checkout.result,
    });
  return {
    commerceClass: row.commerceClass,
    offer: row.identity.id,
    status: selected ? ('supported' as const) : ('blocked' as const),
    rail: selected ? ('ordinary-web-checkout' as const) : null,
    price: selected
      ? { ...row.runtime.price, priceId: activeSku?.price.priceId }
      : null,
    merchantOfRecord: row.ownership.merchantOfRecord,
    handoff: selected
      ? {
          href: getPlanSignupHref('pro', 'month'),
          humanAccountOrClaimRequired: true,
          buyerApprovalRequired: true,
        }
      : null,
    requirements: row.requirements,
    blockers,
    shipNow: selected
      ? 'Use canonical monthly web checkout after human account/claim and explicit buyer approval.'
      : 'Block sale until the recorded blockers have current evidence.',
    reEvaluateWhen: `${row.reEvaluationTrigger} Also on access expiry, denial, account, SKU, price or policy change.`,
    then: 'Import fresh account evidence, refresh the canonical matrix and rerun this selector; certify a changed adapter before enabling it.',
    rejectedAlternatives: rejectedAlternatives.sort((a, b) =>
      a.rail.localeCompare(b.rail, 'en')
    ),
    reversibility: selected
      ? 'Remove the handoff to stop new sales; use canonical Stripe cancellation/refund and entitlement reconciliation for existing subscriptions.'
      : 'No payment or entitlement mutation; unblock only by recompiling current evidence.',
    providerAccess: {
      checkout,
      skus: skuObservations.map(observation => observation.access),
    },
  };
}

/** Pure compilation. Does not create accounts, checkout sessions, orders or entitlements. */
export function compileRailDecisions(
  input: unknown,
  accessInput: unknown,
  accountInput: unknown,
  now = new Date()
) {
  const matrix = matrixProjection.parse(input);
  const accounts = providerAccountsSchema.parse(accountInput);
  if (!Number.isFinite(now.getTime()))
    throw new Error('Invalid decision clock');
  const classes = matrix.rows.map(row => row.commerceClass);
  if (new Set(classes).size !== classes.length)
    throw new Error('Duplicate commerce class');
  const evidence = importProviderAccess(accessInput);
  const matrixRevision = evidenceDigest({
    ...matrix,
    rows: [...matrix.rows].sort((a, b) =>
      a.commerceClass.localeCompare(b.commerceClass, 'en')
    ),
  });
  const age = now.getTime() - Date.parse(matrix.sourceObservedAt);
  const decisions = [...matrix.rows]
    .sort((a, b) => a.commerceClass.localeCompare(b.commerceClass, 'en'))
    .map(row => ({
      ...selectRow(
        row,
        evidence,
        accounts,
        now,
        age >= 0 &&
          age < MAX_SOURCE_AGE_MS &&
          row.evidenceObservedAt <= matrix.sourceObservedAt
      ),
      evidenceRevision: evidence.revision,
      matrixRevision,
      policyRevision: RAIL_DECISION_VERSION,
    }));
  return {
    version: RAIL_DECISION_VERSION,
    evaluatedAt: now.toISOString(),
    evidenceRevision: evidence.revision,
    matrixRevision,
    accessEvidenceValid: evidence.valid,
    decisions,
  };
}
