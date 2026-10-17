import 'server-only';

import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { APP_FLAG_DEFAULTS, type AppFlagName } from '@/lib/flags/contracts';
import {
  ACTIVE_PRICE_MAPPINGS,
  PRICE_MAPPINGS,
  type PriceMapping,
} from '@/lib/stripe/config';
import { visibilityAuditPriceUsd } from '@/lib/visibility-audit/offer';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  getContactSalesHref,
  getPlanSignupHref,
} from '../offer-truth';
import { PLATFORM_EVIDENCE } from './platform-evidence';
import {
  SUPPORT_MATRIX_VERSION,
  type SupportMatrix,
  type SupportRow,
  validateSupportMatrix,
} from './support-contract';

const observedAt = '2026-10-15';
const root = 'apps/web/';
const ref = (path: string, selector: string) => ({
  path: root + path,
  selector,
});
const offer = ref('lib/billing/offer-truth.ts', 'ARTIST_VISIBILITY_OFFER');
const prices = ref('lib/stripe/config.ts', 'PRICE_MAPPINGS');
const noSku = ref('lib/billing/offer-truth.ts', 'isSelfServiceOffer');
const entitlements = ref('lib/entitlements/registry.ts', 'getEntitlements');
const merch = ref('lib/merch/orders.ts', 'createMerchCheckoutSession');
const shop = ref('lib/profile/shop-settings.ts', 'getShopifyUrl');
const tips = ref('app/api/tips/create-checkout/route.ts', 'POST');
const audit = ref(
  'lib/visibility-audit/offer.ts',
  'resolveVisibilityAuditOffer'
);
const assigned = (
  owner: 'jovie' | 'creator' | 'external_merchant' | 'printful',
  basis = offer
): SupportRow['ownership']['support'] => ({ state: 'assigned', owner, basis });
const blocked = (reason: string): SupportRow['ownership']['support'] => ({
  state: 'blocked',
  resolutionOwner: 'jovie',
  issue: 'JOV-4077',
  reason,
});
const jovieOwnership: SupportRow['ownership'] = {
  merchantOfRecord: assigned('jovie', prices),
  sellerOrBeneficiary: assigned('jovie'),
  fulfillment: assigned('jovie', entitlements),
  refund: assigned(
    'jovie',
    ref(
      'content/legal/terms.md',
      'Payment and Subscriptions: Jovie billing and cancellation'
    )
  ),
  support: assigned(
    'jovie',
    ref('lib/config/plan-prices.ts', 'ARTIST_VISIBILITY_OFFER.enterprise.href')
  ),
};
const channel = (
  state: SupportRow['channels']['acpCheckout']['state'],
  evidenceId: string,
  reason: string
) => ({ state, evidenceIds: [evidenceId], reason });
function channels(physical = false, connect = false): SupportRow['channels'] {
  return {
    acpCheckout: channel(
      'partner_gated',
      'openai-acp-checkout-2026-10-15',
      'No Jovie partner approval or checkout canary receipt.'
    ),
    acpDiscovery: channel(
      'partner_gated',
      'openai-acp-discovery-2026-10-15',
      'No approved Jovie feed admission receipt.'
    ),
    chatgptPlugin: channel(
      physical ? 'partner_gated' : 'unsupported',
      `openai-plugin-${physical ? 'physical' : 'nonphysical'}-2026-10-15`,
      physical
        ? 'Physical goods are a candidate; Jovie plugin approval is unverified.'
        : 'Purchase monetization eligibility is not established for this class.'
    ),
    spt: channel(
      'UNKNOWN',
      `stripe-spt-${connect ? 'connect' : 'seller'}-2026-10-15`,
      'No account-specific access or authorized transaction receipt.'
    ),
    stripeDistribution: channel(
      'UNKNOWN',
      'stripe-distribution-2026-10-15',
      'No Jovie channel or SKU admission receipt.'
    ),
  };
}
function stripe(
  kind: SupportRow['stripe']['kind'],
  source: SupportRow['stripe']['source'],
  mappings: PriceMapping[] = []
): SupportRow['stripe'] {
  return {
    kind,
    source,
    prices: mappings.map(price => ({
      priceId: price.priceId,
      amountCents: price.amount,
      currency: price.currency,
      interval: price.interval,
      legacy: price.legacy === true,
    })),
    productId: null,
    limitation:
      kind === 'none'
        ? 'No sellable Stripe SKU for this capability.'
        : 'Product ID is not stored in local mappings; resolve it from Stripe before publishing a feed. No account access inferred.',
  };
}
function runtime(
  source: SupportRow['runtime']['price']['source']
): SupportRow['runtime'] {
  return {
    price: { source, amountCents: null, currency: null, interval: null },
    featureFlag: {
      source: noSku,
      name: null,
      defaultValue: null,
      evaluation: 'not_applicable',
    },
    connect: ref(
      'lib/stripe/connect-readiness.ts',
      'isStripeConnectChargesReady: evaluate per creator; no live account observed'
    ),
    fulfillment: source,
    entitlement: entitlements,
  };
}
function flag(name: AppFlagName): SupportRow['runtime']['featureFlag'] {
  return {
    source: ref('lib/flags/contracts.ts', 'APP_FLAG_DEFAULTS'),
    name,
    defaultValue: APP_FLAG_DEFAULTS[name],
    evaluation: 'per_request',
  };
}
function base(
  commerceClass: SupportRow['commerceClass'],
  source = offer
): SupportRow {
  return {
    commerceClass,
    identity: {
      kind: 'capability',
      id: `${source.path}#${source.selector}`,
      source,
    },
    offerType: 'capability',
    ownership: jovieOwnership,
    stripe: stripe('none', noSku),
    channels: channels(),
    runtime: runtime(source),
    webFallback: { state: 'none', source },
    requirements: {
      claim: [
        'Use canonical price/entitlement/availability sources; public documentation is not Jovie runtime certification.',
      ],
      approval: [
        'Jovie offer/merchant owner approval, channel admission, buyer authorization, and paid/refund/fulfillment canary under JOV-4077 before enabling sales.',
      ],
    },
    evidenceObservedAt: observedAt,
    geographicLimits:
      'UNKNOWN for agent channels; resolve account, seller, tax, currency, and buyer-market restrictions before sale.',
    availability: 'planned',
    reEvaluationTrigger:
      'Canonical offer, ownership, flag, terms, channel access, or provider evidence changes; refresh receipts by 2026-11-14, then revalidate before claiming support.',
  };
}

/**
 * One JSON-serializable projection over existing primitives, not a sellable catalog.
 * Per-card/per-creator bindings deliberately remain references to runtime guards.
 * Call validation again after caching/deserializing; freshness is time-dependent.
 */
export function getCommerceSupportMatrix(now = new Date()): SupportMatrix {
  const active = Object.values(ACTIVE_PRICE_MAPPINGS);
  const legacy = Object.values(PRICE_MAPPINGS).filter(price => price.legacy);
  const ancillary = legacy.filter(
    price => price.description === 'YouTube Thumbnails Founder'
  );
  const rows: SupportRow[] = [
    {
      ...base(
        'ancillary_subscription',
        ref(
          'lib/youtube/thumbnail-entitlements.ts',
          'resolveYouTubeThumbnailPlan'
        )
      ),
      offerType: 'subscription',
      stripe: stripe('configured_prices', prices, ancillary),
      availability: 'legacy',
      webFallback: { state: 'existing_subscribers_only', source: prices },
      runtime: {
        ...runtime(prices),
        entitlement: ref(
          'lib/youtube/thumbnail-entitlements.ts',
          'resolveYouTubeThumbnailPlan: exact price, not Pro plan'
        ),
      },
    },
    {
      ...base('api_mcp_service', {
        path: 'packages/jovie-cli/src/mcp.ts',
        selector: 'MCP tools; no standalone sellable SKU',
      }),
      requirements: {
        claim: [
          'API or MCP tool availability is not a paid offer or delegated buying authority.',
        ],
        approval: [
          'Create and approve a canonical offer and ownership policy under JOV-4077 before any sales claim.',
        ],
      },
    },
    {
      ...base('artist_visibility_pro'),
      identity: {
        kind: 'offer',
        id: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
        source: ref(
          'lib/billing/offer-truth.ts',
          'artist-visibility-offer-contract-v1: pro/month'
        ),
      },
      offerType: 'subscription',
      stripe: stripe(
        'configured_prices',
        ref('lib/stripe/config.ts', 'ACTIVE_PRICE_MAPPINGS'),
        active
      ),
      runtime: {
        ...runtime(offer),
        price: {
          source: offer,
          amountCents: toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
          currency: ARTIST_VISIBILITY_OFFER.pro.currency,
          interval: ARTIST_VISIBILITY_OFFER.pro.interval,
        },
        connect: ref(
          'lib/stripe/client.ts',
          'createCheckoutSession: platform subscription; Connect not required'
        ),
        entitlement: ref(
          'lib/entitlements/creator-plan.ts',
          'getCreatorPlanEntitlements: exact price grants and fan-send exclusion'
        ),
      },
      availability: active.length ? 'runtime_gated' : 'blocked',
      webFallback: {
        state: 'runtime_gated',
        source: ref('lib/billing/offer-truth.ts', getPlanSignupHref('pro')),
      },
    },
    {
      ...base('creator_payments', tips),
      offerType: 'payment',
      channels: channels(false, true),
      stripe: stripe('inline_price_data', tips),
      ownership: {
        merchantOfRecord: blocked(
          'Destination charge is not a merchant-of-record policy receipt.'
        ),
        sellerOrBeneficiary: assigned('creator', tips),
        fulfillment: assigned('jovie', tips),
        refund: blocked(
          'Confirm creator versus platform refund responsibility before agent purchases.'
        ),
        support: assigned('jovie', tips),
      },
      runtime: {
        ...runtime(tips),
        featureFlag: flag('STRIPE_CONNECT_ENABLED'),
        fulfillment: ref(
          'app/api/webhooks/stripe-tips/route.ts',
          'POST: verified tip payment'
        ),
      },
      availability: 'blocked',
      webFallback: { state: 'runtime_gated', source: tips },
    },
    {
      ...base(
        'disabled_usage_billing',
        ref('lib/config/plan-prices.ts', 'ARTIST_VISIBILITY_OFFER.fanSends')
      ),
      offerType: 'usage',
      availability: ARTIST_VISIBILITY_OFFER.fanSends.paidSendingEnabled
        ? 'planned'
        : 'disabled',
      runtime: {
        ...runtime(offer),
        featureFlag: {
          source: ref(
            'lib/config/plan-prices.ts',
            'ARTIST_VISIBILITY_OFFER.fanSends.paidSendingEnabled'
          ),
          name: null,
          defaultValue: ARTIST_VISIBILITY_OFFER.fanSends.paidSendingEnabled,
          evaluation: 'source_disabled',
        },
      },
      webFallback: {
        state: 'none',
        source: ref('constants/routes.ts', APP_ROUTES.SETTINGS_USAGE),
      },
    },
    {
      ...base('enterprise_handoff'),
      offerType: 'sales_handoff',
      availability: 'handoff',
      webFallback: {
        state: 'handoff',
        source: ref('lib/billing/offer-truth.ts', getContactSalesHref()),
      },
    },
    {
      ...base('external_store_merch', shop),
      offerType: 'physical_goods',
      channels: channels(true),
      ownership: {
        merchantOfRecord: assigned('external_merchant', shop),
        sellerOrBeneficiary: assigned('external_merchant', shop),
        fulfillment: assigned('external_merchant', shop),
        refund: assigned('external_merchant', shop),
        support: assigned('external_merchant', shop),
      },
      stripe: stripe('none', shop),
      availability: 'handoff',
      webFallback: { state: 'handoff', source: shop },
      runtime: {
        ...runtime(shop),
        entitlement: shop,
        connect: shop,
        featureFlag: {
          source: shop,
          name: null,
          defaultValue: null,
          evaluation: 'not_applicable',
        },
      },
      geographicLimits:
        'External merchant governs markets, price, currency, inventory, refunds, and checkout; Jovie has only validated HTTPS myshopify store handoff, not imported SKUs.',
    },
    {
      ...base(
        'hosted_creator_merch',
        ref('lib/db/schema/merch.ts', 'merchCards.id + variantKey')
      ),
      offerType: 'physical_goods',
      channels: channels(true, true),
      ownership: {
        merchantOfRecord: blocked(
          'Platform charge and Connect readiness do not establish merchant-of-record policy.'
        ),
        sellerOrBeneficiary: assigned('creator', merch),
        fulfillment: assigned(
          'printful',
          ref('lib/merch/orders.ts', 'fulfillMerchOrder')
        ),
        refund: blocked(
          'Refund event handling is not an approved merchant refund policy.'
        ),
        support: blocked(
          'Assign buyer support responsibility before agent channel sale.'
        ),
      },
      stripe: stripe('inline_price_data', merch),
      availability: 'blocked',
      runtime: {
        ...runtime(
          ref(
            'lib/db/schema/merch.ts',
            'merchCards.retailPriceCents / currency / printful / pricing'
          )
        ),
        featureFlag: flag('MERCH_MVP'),
        fulfillment: ref(
          'lib/merch/orders.ts',
          'fulfillMerchOrder: submission is not delivery'
        ),
      },
      webFallback: { state: 'runtime_gated', source: merch },
      geographicLimits:
        'US shipping only, USD hosted pricing. Per-card sellability, public profile visibility, MERCH_MVP and trusted creator Connect readiness must pass at checkout.',
    },
    {
      ...base('legacy_offer', prices),
      offerType: 'subscription',
      availability: 'legacy',
      stripe: stripe('configured_prices', prices, legacy),
      webFallback: { state: 'existing_subscribers_only', source: prices },
      requirements: {
        claim: [
          'Retired Pro/annual/Max/founding prices resolve existing subscribers only; never publish for new sale.',
        ],
        approval: [
          'A new canonical offer and approval are required to sell again; existing legacy identity cannot authorize it.',
        ],
      },
    },
    {
      ...base('one_time_service', audit),
      offerType: 'service',
      stripe: stripe(
        'payment_link',
        ref('lib/env-server-schema.ts', 'VISIBILITY_AUDIT_PAYMENT_LINK_URL')
      ),
      ownership: {
        ...jovieOwnership,
        fulfillment: blocked(
          'Public offer probe does not certify paid audit delivery; require fulfillment evidence.'
        ),
      },
      runtime: {
        ...runtime(audit),
        price: {
          source: audit,
          amountCents: toCents(visibilityAuditPriceUsd()),
          currency: ARTIST_VISIBILITY_OFFER.pro.currency,
          interval: null,
        },
        featureFlag: flag('VISIBILITY_AUDIT_OFFER'),
      },
      availability: 'blocked',
      webFallback: { state: 'runtime_gated', source: audit },
    },
  ];
  return validateSupportMatrix(
    {
      version: SUPPORT_MATRIX_VERSION,
      sourceObservedAt: observedAt,
      evidence: PLATFORM_EVIDENCE,
      rows,
    },
    now
  );
}
