import type { MarketingCopyClaim } from '@/data/marketing/copy';

/**
 * Publish-safe evidence receipts for the factual claims on the comparison,
 * alternative, and site-level LLM guidance surfaces (JOV-5037).
 *
 * The evidence URLs are deliberately safe to include in review artifacts:
 * public first-party documentation for competitors and public/canonical Jovie
 * source for Jovie facts. Runtime routes never fetch these URLs.
 */
export interface PublishedClaimReceipt extends MarketingCopyClaim {
  readonly owner: 'marketing-architecture';
  readonly verifiedAt: string;
  readonly reviewAfter: string;
}

const JOVIE_SOURCE_ROOT =
  'https://github.com/JovieInc/Jovie/blob/6aa757b2a0f0f1088271f3e55a32109fbfba9e0c/apps/web';

export const PUBLISHED_CLAIM_RECEIPTS = {
  'jovie.company-identity': {
    id: 'jovie.company-identity',
    statement:
      'Jovie at jov.ie is Jovie Technology Inc., a product for presence, relationships, and growth founded by Tim White.',
    evidence: [
      'https://jov.ie/about',
      `${JOVIE_SOURCE_ROOT}/data/companyIdentity.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.public-profile': {
    id: 'jovie.public-profile',
    statement:
      'Jovie publishes claimable public profiles; the capability is generally available and open.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      'https://jov.ie/product',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.smart-links': {
    id: 'jovie.smart-links',
    statement:
      'Jovie release smart links and remembered fan platform choice are generally available and open.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      'https://jov.ie/smart-links',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.pre-save': {
    id: 'jovie.pre-save',
    statement:
      'Jovie includes pre-save access in the canonical smart-links capability and entitlement registry.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      `${JOVIE_SOURCE_ROOT}/lib/entitlements/registry.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.contact-collection': {
    id: 'jovie.contact-collection',
    statement:
      'Jovie public profiles include audience capture; CRM limits and export access are plan-specific.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      `${JOVIE_SOURCE_ROOT}/lib/entitlements/registry.ts`,
      'https://jov.ie/pricing',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.fan-notifications': {
    id: 'jovie.fan-notifications',
    statement:
      'Jovie opt-in fan notifications are published and generally available, with enrolled access.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      'https://jov.ie/artist-notifications',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.analytics': {
    id: 'jovie.analytics',
    statement:
      'Jovie advanced analytics are in limited testing with enrolled access.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      `${JOVIE_SOURCE_ROOT}/lib/entitlements/registry.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.release-workspace': {
    id: 'jovie.release-workspace',
    statement:
      'Jovie release planning is generally available with enrolled access and includes task-workspace entitlements.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      'https://jov.ie/launch',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.ai-assistant': {
    id: 'jovie.ai-assistant',
    statement:
      'Jovie AI-assistant capabilities are in limited testing with enrolled access.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      `${JOVIE_SOURCE_ROOT}/lib/entitlements/registry.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.free-profile': {
    id: 'jovie.free-profile',
    statement:
      'Jovie has a $0 self-service public-profile offer with audience capture.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/lib/billing/offer-truth.ts`,
      'https://jov.ie/pricing',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.pricing': {
    id: 'jovie.pricing',
    statement:
      'Jovie public prices and access labels derive from the canonical offer-truth contract.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/lib/billing/offer-truth.ts`,
      'https://jov.ie/pricing',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.capability-access': {
    id: 'jovie.capability-access',
    statement:
      'Jovie capability maturity, publication, and access are separate and resolve from the canonical product-truth registry.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/data/product-truth/registry.ts`,
      `${JOVIE_SOURCE_ROOT}/data/marketing/featureAvailability.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.technical-stack': {
    id: 'jovie.technical-stack',
    statement:
      'Jovie is a Next.js web application using Better Auth, Stripe, Vercel, and PostgreSQL on Neon.',
    evidence: [
      `${JOVIE_SOURCE_ROOT}/package.json`,
      `${JOVIE_SOURCE_ROOT}/lib/auth/better-auth.ts`,
      `${JOVIE_SOURCE_ROOT}/lib/config/plan-prices.ts`,
      'https://github.com/JovieInc/Jovie/blob/6aa757b2a0f0f1088271f3e55a32109fbfba9e0c/vercel.json',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.public-developer-access': {
    id: 'jovie.public-developer-access',
    statement:
      'Jovie publishes a read-only public artist API, CLI, per-artist llms.txt, and anonymous per-artist MCP resources; owner writes require authentication and confirmation.',
    evidence: [
      'https://jov.ie/developers',
      'https://jov.ie/api/v1/openapi.json',
      'https://jov.ie/cli',
      `${JOVIE_SOURCE_ROOT}/lib/api/v1/contract.ts`,
      `${JOVIE_SOURCE_ROOT}/lib/ovie/mcp/oauth-contract.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.founder': {
    id: 'jovie.founder',
    statement: 'Tim White is the founder of Jovie.',
    evidence: [
      'https://jov.ie/about',
      `${JOVIE_SOURCE_ROOT}/data/aboutCopy.ts`,
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'jovie.childcare-disambiguation': {
    id: 'jovie.childcare-disambiguation',
    statement:
      'Jovie at jov.ie is unrelated to the Bright Horizons childcare business at jovie.com.',
    evidence: ['https://jov.ie/about', 'https://www.jovie.com/'],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2027-01-01',
  },
  'linktree.link-page': {
    id: 'linktree.link-page',
    statement: 'Linktree publishes customizable link pages and link ordering.',
    evidence: [
      'https://linktr.ee/help/en/articles/5434144-how-to-move-and-reorder-your-links',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linktree.contact-collection': {
    id: 'linktree.contact-collection',
    statement:
      'Linktree contact forms collect email sign-ups and store or export submissions.',
    evidence: [
      'https://linktr.ee/help/en/articles/5434187-how-to-collect-email-sign-ups-on-your-linktree',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linktree.notifications': {
    id: 'linktree.notifications',
    statement:
      'Linktree Subscribe lets creators collect subscribers and send or schedule link-update notifications.',
    evidence: [
      'https://linktr.ee/help/en/articles/5735268-subscribe-to-a-linktree',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linktree.analytics': {
    id: 'linktree.analytics',
    statement:
      'Linktree Insights documents views, clicks, sources, locations, and plan-dependent subscriber analytics.',
    evidence: [
      'https://linktr.ee/help/en/articles/5434178-understanding-your-insights',
      'https://linktr.ee/help/en/articles/5434172-individual-link-analytics',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linktree.music-links': {
    id: 'linktree.music-links',
    statement:
      'Linktree Music Links show the streaming services available for a song or album.',
    evidence: [
      'https://linktr.ee/help/en/articles/5453735-how-to-add-a-music-link-to-your-linktree',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linktree.free-plan': {
    id: 'linktree.free-plan',
    statement: 'Linktree publishes a Free plan with plan-dependent analytics.',
    evidence: [
      'https://linktr.ee/help/en/articles/5434178-understanding-your-insights',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.smart-links': {
    id: 'linkfire.smart-links',
    statement:
      'Linkfire publishes smart links for music releases and other entertainment content.',
    evidence: ['https://www.linkfire.com/'],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.pre-save': {
    id: 'linkfire.pre-save',
    statement: 'Linkfire publishes pre-release and pre-save link capabilities.',
    evidence: [
      'https://www.linkfire.com/pricing',
      'https://help.linkfire.com/hc/en-us/articles/21891630940060-How-To-Set-Up-Pre-save-Subscriptions',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.bio-links': {
    id: 'linkfire.bio-links',
    statement:
      'Linkfire Bio Links are customizable artist microsites for releases, merch, social profiles, tours, and other content.',
    evidence: [
      'https://help.linkfire.com/hc/en-us/articles/360014197000-How-to-create-an-artist-bio-link',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.email-collection': {
    id: 'linkfire.email-collection',
    statement:
      'Linkfire publishes email collection for its plans and Bio Links.',
    evidence: [
      'https://www.linkfire.com/pricing',
      'https://help.linkfire.com/hc/en-us/articles/360020115339-Step-4-Create-your-bio-link',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.notifications': {
    id: 'linkfire.notifications',
    statement:
      'Linkfire pre-save subscriptions can add future releases and send automated emails for supported services and consent paths.',
    evidence: [
      'https://help.linkfire.com/hc/en-us/articles/21891630940060-How-To-Set-Up-Pre-save-Subscriptions',
      'https://help.linkfire.com/hc/en-us/articles/22112518506780-What-is-a-Pre-Save-Subscription-and-How-Does-it-Work-fan-experience',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.analytics': {
    id: 'linkfire.analytics',
    statement:
      'Linkfire publishes link, streaming, marketing-channel, location, and historical analytics.',
    evidence: [
      'https://www.linkfire.com/pricing',
      'https://help.linkfire.com/hc/en-us/articles/360014197000-How-to-create-an-artist-bio-link',
    ],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
  'linkfire.plans': {
    id: 'linkfire.plans',
    statement:
      'Linkfire publishes plans for solo artists, teams, premium and enterprise use, with a trial and limited free account after trial.',
    evidence: ['https://www.linkfire.com/pricing'],
    owner: 'marketing-architecture',
    verifiedAt: '2026-10-01',
    reviewAfter: '2026-12-15',
  },
} as const satisfies Readonly<Record<string, PublishedClaimReceipt>>;

export type PublishedClaimId = keyof typeof PUBLISHED_CLAIM_RECEIPTS;

export interface ClaimReceiptIssue {
  readonly claimId: string;
  readonly code:
    | 'duplicate-id'
    | 'expired'
    | 'invalid-evidence-url'
    | 'invalid-lifecycle'
    | 'missing-evidence'
    | 'missing-owner'
    | 'unknown-claim';
  readonly message: string;
}

export function validatePublishedClaimReceipts(
  claimIds: readonly string[],
  asOf: Date
): readonly ClaimReceiptIssue[] {
  const issues: ClaimReceiptIssue[] = [];
  const seen = new Set<string>();

  for (const claimId of claimIds) {
    if (seen.has(claimId)) {
      issues.push({
        claimId,
        code: 'duplicate-id',
        message: `Claim ${claimId} is bound more than once in the same item.`,
      });
      continue;
    }
    seen.add(claimId);

    const receipt = (
      PUBLISHED_CLAIM_RECEIPTS as Readonly<
        Record<string, PublishedClaimReceipt | undefined>
      >
    )[claimId];
    if (!receipt) {
      issues.push({
        claimId,
        code: 'unknown-claim',
        message: `Claim ${claimId} has no publish-safe evidence receipt.`,
      });
      continue;
    }
    if (!receipt.owner) {
      issues.push({
        claimId,
        code: 'missing-owner',
        message: `Claim ${claimId} has no accountable owner.`,
      });
    }
    if (receipt.evidence.length === 0) {
      issues.push({
        claimId,
        code: 'missing-evidence',
        message: `Claim ${claimId} has no evidence URL.`,
      });
    }
    for (const url of receipt.evidence) {
      if (!url.startsWith('https://')) {
        issues.push({
          claimId,
          code: 'invalid-evidence-url',
          message: `Claim ${claimId} evidence must be a publish-safe HTTPS URL.`,
        });
      }
    }

    const verifiedAt = Date.parse(`${receipt.verifiedAt}T00:00:00Z`);
    const reviewAfter = Date.parse(`${receipt.reviewAfter}T23:59:59Z`);
    if (
      !Number.isFinite(verifiedAt) ||
      !Number.isFinite(reviewAfter) ||
      reviewAfter <= verifiedAt
    ) {
      issues.push({
        claimId,
        code: 'invalid-lifecycle',
        message: `Claim ${claimId} has an invalid verification lifecycle.`,
      });
    } else if (asOf.getTime() > reviewAfter) {
      issues.push({
        claimId,
        code: 'expired',
        message: `Claim ${claimId} evidence expired after ${receipt.reviewAfter}.`,
      });
    }
  }

  return issues;
}

/**
 * Exact reviewed-output hashes. Tests recompute these from the checked-in
 * data and route responses, so copy cannot change while retaining stale claim
 * ids and evidence receipts.
 */
export const SCOPED_CLAIM_SURFACE_HASHES = {
  '/compare/linktree':
    '515e0a4c0437680b5b264fb2b3829a8b9486eb1371d3a20112811396911e4cd7',
  '/compare/linkfire':
    '0b2d66dc78d69d39852ecd247f4e7b28c8243ea471cd65b56b7e6ded91d421d5',
  '/alternatives/linktree':
    'c679a7b4cf862784e81151d5df2472f0c81530328e44beec1e4bd85f390ce286',
  '/alternatives/link-in-bio':
    '67847983a3ac9762697e6b3d9f5a33733c2157e2799b17565f729fba41393e22',
  '/llms.txt':
    '0c73204a40fc6e051a7927daaed125699c47c43e2d379e8b89269e2954a40030',
  '/llms-full.txt':
    '6da98fb79883a34ae08e943b1bd0d9ae4934c654b1244eb48d21a3712b0388f6',
} as const;
