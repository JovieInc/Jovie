import { EVIDENCE_VERSION, type PlatformEvidence } from './support-contract';

// Canonical receipts: public documentation is evidence of provider policy,
// never evidence that Jovie's account, SKU, or connected seller was admitted.
const dates = { observedAt: '2026-10-15', recheckAt: '2026-11-14' } as const;
export const PLATFORM_EVIDENCE: PlatformEvidence[] = [
  {
    version: EVIDENCE_VERSION,
    id: 'openai-acp-checkout-2026-10-15',
    provider: 'openai',
    channel: 'acpCheckout',
    url: 'https://developers.openai.com/commerce/specs/checkout',
    ...dates,
    finding: 'partner_gated',
    claim:
      'The protocol is open; ChatGPT Instant Checkout requires partner approval and a merchant checkout integration.',
    termsOrAccessConstraints: [
      'Approved partner access; merchant owns order, payment, and compliance flows.',
    ],
    uncertainty:
      'No Jovie approval or end-to-end checkout receipt has been observed.',
    geographicLimits:
      'Jovie account and offer markets UNKNOWN; do not infer worldwide eligibility.',
  },
  {
    version: EVIDENCE_VERSION,
    id: 'openai-acp-discovery-2026-10-15',
    provider: 'openai',
    channel: 'acpDiscovery',
    url: 'https://developers.openai.com/commerce/guides/get-started',
    ...dates,
    finding: 'partner_gated',
    claim:
      'Product feed onboarding requires approval; a public product page alone does not establish feed admission.',
    termsOrAccessConstraints: [
      'Approved partner onboarding and prohibited-products policy apply.',
    ],
    uncertainty:
      'Jovie feed admission and offer-specific eligibility are UNKNOWN.',
    geographicLimits: 'Jovie feed target markets UNKNOWN.',
  },
  {
    version: EVIDENCE_VERSION,
    id: 'openai-plugin-nonphysical-2026-10-15',
    provider: 'openai',
    channel: 'chatgptPlugin',
    url: 'https://developers.openai.com/plugins/build/monetization',
    ...dates,
    finding: 'unsupported',
    claim:
      'Current purchase-plugin approval is limited to physical goods; digital services and subscriptions have no established purchase eligibility here.',
    termsOrAccessConstraints: [
      'Physical-goods purchase restriction; embedded payment sheet is a select-marketplace beta.',
    ],
    uncertainty:
      'This purchase restriction does not determine eligibility for non-commerce MCP tools.',
    geographicLimits: 'No Jovie purchase-plugin markets established.',
  },
  {
    version: EVIDENCE_VERSION,
    id: 'openai-plugin-physical-2026-10-15',
    provider: 'openai',
    channel: 'chatgptPlugin',
    url: 'https://developers.openai.com/plugins/build/monetization',
    ...dates,
    finding: 'partner_gated',
    claim:
      'Eligible physical-goods plugins can use external checkout; embedded payment-sheet access is restricted.',
    termsOrAccessConstraints: [
      'Plugin approval, merchant policies, and physical-goods eligibility required.',
    ],
    uncertainty:
      'No approved Jovie plugin or marketplace beta access receipt observed.',
    geographicLimits:
      'Jovie account markets UNKNOWN; hosted merch remains US-only in source.',
  },
  {
    version: EVIDENCE_VERSION,
    id: 'stripe-distribution-2026-10-15',
    provider: 'stripe',
    channel: 'stripeDistribution',
    url: 'https://docs.stripe.com/agentic-commerce/sellers/use-cases/retail',
    ...dates,
    finding: 'UNKNOWN',
    claim:
      'Stripe documents catalog distribution and agent checkout through Agentic Commerce Suite.',
    termsOrAccessConstraints: [
      'Activated account, Stripe profile and merchant policies, tax configuration, and feed onboarding required.',
    ],
    uncertainty:
      'Jovie enrollment and each channel/SKU admission are unverified; a normal Stripe price is insufficient.',
    geographicLimits:
      'Provider lists US, Canada, and select European countries; Jovie eligibility UNKNOWN.',
  },
  {
    version: EVIDENCE_VERSION,
    id: 'stripe-spt-connect-2026-10-15',
    provider: 'stripe',
    channel: 'spt',
    url: 'https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=connect',
    ...dates,
    finding: 'UNKNOWN',
    claim:
      'The SPT index links a Connect-specific variant, but that variant could not be retrieved during this observation.',
    termsOrAccessConstraints: [
      'Connect-specific requirements and terms must be retrieved and verified before use.',
    ],
    uncertainty:
      'Retrieval failed; seller documentation does not prove Connect support or Jovie access.',
    geographicLimits: 'Connect-specific market eligibility UNKNOWN.',
  },
  {
    version: EVIDENCE_VERSION,
    id: 'stripe-spt-seller-2026-10-15',
    provider: 'stripe',
    channel: 'spt',
    url: 'https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller',
    ...dates,
    finding: 'UNKNOWN',
    claim:
      'SPTs provide scoped, expiring payment-method grants; accepting them requires a distinct integration.',
    termsOrAccessConstraints: [
      'Stripe agentic-commerce seller service terms and Stripe profile apply; examples use a preview API version.',
    ],
    uncertainty:
      'Jovie account access, SKU eligibility, and an authorized payment/refund canary are unverified.',
    geographicLimits:
      'US, Canada, and select European countries documented; Jovie markets UNKNOWN.',
  },
];
