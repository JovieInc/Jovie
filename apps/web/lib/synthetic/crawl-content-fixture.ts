/**
 * Crawl content fixture (domain `synthetic.crawl-content-fixture`).
 *
 * The product crawl can only check pages that have public content behind
 * them. Three routes have none on any real profile, so the crawl reported
 * them as uncovered:
 *
 *   /[username]/[slug]/download   promo download gate (Pro + active file)
 *   /[username]/merch/[cardId]    public merch card
 *   /a/[handle]/[slug]            public library asset share
 *
 * This fixture is one hidden demo artist that owns exactly one of each.
 * The JSON beside this file is the single source of truth: the reconciler
 * (`scripts/crawl-content-fixture-reconcile.ts`) converges production to it,
 * and `scripts/product-crawl/sample-params.mjs` reads the same file to visit
 * the three pages.
 *
 * Hidden by construction:
 * - the handle is a reserved identity (`crawl_content_fixture`), so it is
 *   noindex and out of search, sitemap and every assignment flow;
 * - the owner is a `browse-ready+…@jov.ie` harness address, so discovery and
 *   metrics exclude it; it is direct-URL exempt only so the crawl can load it;
 * - the profile is unlisted (`settings.searchable = false`).
 *
 * Not purchasable by construction: the merch card carries no print files and
 * no Printful-sourced cost, and the profile has no Stripe Connect account, so
 * checkout refuses before any Stripe session exists.
 */
import type {
  MerchLearningSnapshot,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';
import fixtureJson from './crawl-content-fixture.json';

export const CRAWL_CONTENT_FIXTURE_SCHEMA = 'jovie.crawl-content-fixture/v1';
export const CRAWL_CONTENT_FIXTURE_RECEIPT_SCHEMA =
  'jovie.crawl-content-fixture-receipt/v1';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface CrawlContentFixture {
  readonly schema: typeof CRAWL_CONTENT_FIXTURE_SCHEMA;
  readonly version: number;
  readonly email: string;
  readonly clerkId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly release: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
  };
  readonly promoDownload: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly fileName: string;
  };
  readonly merchCard: {
    readonly id: string;
    readonly title: string;
  };
}

export function parseCrawlContentFixture(input: unknown): CrawlContentFixture {
  const fixture = input as CrawlContentFixture;
  const problems: string[] = [];
  if (fixture?.schema !== CRAWL_CONTENT_FIXTURE_SCHEMA) {
    problems.push(`schema must be ${CRAWL_CONTENT_FIXTURE_SCHEMA}`);
  }
  if (!Number.isInteger(fixture?.version) || fixture.version < 1) {
    problems.push('version must be a positive integer');
  }
  if (!/^browse-ready\+[a-z0-9-]+@jov\.ie$/u.test(fixture?.email ?? '')) {
    problems.push('email must be a browse-ready+ harness address on jov.ie');
  }
  if (!SLUG_PATTERN.test(fixture?.handle ?? '')) {
    problems.push('handle must be a lowercase slug');
  }
  for (const [name, id] of [
    ['release.id', fixture?.release?.id],
    ['promoDownload.id', fixture?.promoDownload?.id],
    ['merchCard.id', fixture?.merchCard?.id],
  ] as const) {
    if (!UUID_PATTERN.test(id ?? '')) problems.push(`${name} must be a uuid`);
  }
  for (const [name, slug] of [
    ['release.slug', fixture?.release?.slug],
    ['promoDownload.slug', fixture?.promoDownload?.slug],
  ] as const) {
    if (!SLUG_PATTERN.test(slug ?? '')) problems.push(`${name} must be a slug`);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid crawl content fixture: ${problems.join('; ')}`);
  }
  return fixture;
}

export const CRAWL_CONTENT_FIXTURE: CrawlContentFixture =
  parseCrawlContentFixture(fixtureJson);

/** The three public paths this fixture exists to make reachable. */
export function crawlContentFixturePaths(
  fixture: CrawlContentFixture = CRAWL_CONTENT_FIXTURE
): {
  readonly download: string;
  readonly merch: string;
  readonly assetShare: string;
} {
  return {
    download: `/${fixture.handle}/${fixture.release.slug}/download`,
    merch: `/${fixture.handle}/merch/${fixture.merchCard.id}`,
    // A release's public share slug is its smart-link slug
    // (`deriveLibraryAssetShareSlug` with the smart-link path).
    assetShare: `/a/${fixture.handle}/${fixture.release.slug}`,
  };
}

/** Public files in apps/web/public, so no remote image host is involved. */
export const CRAWL_FIXTURE_RELEASE_ARTWORK_PATH = '/images/demo/artwork-1.png';
export const CRAWL_FIXTURE_MERCH_IMAGE_PATH = '/images/demo/artwork-2.png';

/** Synthetic merch snapshots: renderable, deliberately not sellable. */
export function buildCrawlFixtureMerchSnapshots(): {
  readonly printful: MerchPrintfulSnapshot;
  readonly pricing: MerchPricingSnapshot;
  readonly learning: MerchLearningSnapshot;
} {
  return {
    printful: {
      catalogProductId: 0,
      catalogVariantIds: [],
      // One size so the page renders its normal size picker.
      variantMap: { M: 0 },
      placements: [],
      techniques: [],
      // No print files and no Printful-sourced cost: checkout refuses.
      printFileUrls: [],
      availabilityRegion: 'US',
      shippingProfile: 'none',
      catalogCostSource: 'manual',
      catalogProductName: 'Crawl fixture tee (not for sale)',
    },
    pricing: {
      currency: 'USD',
      retailPriceCents: 3000,
      estimatedPrintfulProductCostCents: 0,
      estimatedShippingCostCents: 0,
      stripeFeeEstimateCents: 0,
      refundReserveCents: 0,
      artistRoyaltyRateBps: 0,
      artistPayoutPerUnitEstimateCents: 0,
      jovieMarginPerUnitEstimateCents: 0,
      printfulCostSource: 'manual',
    },
    learning: {
      styleLane: 'fixture',
      typographyStyle: 'fixture',
      graphicDensity: 'minimal',
      garmentColor: 'black',
      motifs: [],
      selectedOverOptionIds: [],
      rejectedAttributes: [],
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Observed state and plan (pure, unit-tested)                              */
/* ------------------------------------------------------------------------ */

export interface CrawlContentObservedState {
  readonly user: { readonly id: string } | null;
  readonly profile: {
    readonly id: string;
    readonly userId: string | null;
    readonly isPublic: boolean | null;
    readonly isClaimed: boolean | null;
  } | null;
  readonly claimUserId: string | null;
  readonly release: { readonly creatorProfileId: string } | null;
  readonly releaseApproved: boolean;
  readonly releaseProviderLink: boolean;
  readonly promoDownload: {
    readonly creatorProfileId: string;
    readonly isActive: boolean;
  } | null;
  readonly merchCard: {
    readonly creatorProfileId: string;
    readonly status: string;
  } | null;
  readonly assetShareVisibility: 'public' | 'private' | null;
}

export type CrawlContentStepName =
  | 'user'
  | 'profile'
  | 'claim'
  | 'release'
  | 'release-approval'
  | 'release-provider-link'
  | 'promo-download'
  | 'merch-card'
  | 'asset-share';

export interface CrawlContentStep {
  readonly name: CrawlContentStepName;
  readonly action: 'create' | 'converge' | 'none';
}

export class CrawlContentFixtureGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrawlContentFixtureGuardError';
  }
}

/**
 * Refuse to touch anything the fixture does not own: a handle bound to
 * another user, or a fixed-id row that belongs to another profile.
 */
export function assertCrawlContentOwnership(
  state: CrawlContentObservedState,
  fixture: CrawlContentFixture = CRAWL_CONTENT_FIXTURE
): void {
  const profile = state.profile;
  if (profile?.userId && profile.userId !== state.user?.id) {
    throw new CrawlContentFixtureGuardError(
      `Handle ${fixture.handle} is bound to another user; refusing to adopt it`
    );
  }
  if (state.claimUserId && state.claimUserId !== state.user?.id) {
    throw new CrawlContentFixtureGuardError(
      `Handle ${fixture.handle} is claimed by another user; refusing to adopt it`
    );
  }
  const rows: ReadonlyArray<
    readonly [string, { readonly creatorProfileId: string } | null]
  > = [
    ['release', state.release],
    ['promo download', state.promoDownload],
    ['merch card', state.merchCard],
  ];
  for (const [label, row] of rows) {
    if (row && row.creatorProfileId !== profile?.id) {
      throw new CrawlContentFixtureGuardError(
        `Fixture ${label} id already belongs to another profile; refusing to move it`
      );
    }
  }
}

export function planCrawlContentFixture(
  state: CrawlContentObservedState,
  fixture: CrawlContentFixture = CRAWL_CONTENT_FIXTURE
): CrawlContentStep[] {
  assertCrawlContentOwnership(state, fixture);
  const step = (
    name: CrawlContentStepName,
    exists: boolean,
    converged: boolean
  ): CrawlContentStep => ({
    name,
    action: !exists ? 'create' : converged ? 'none' : 'converge',
  });
  // Every existing row is re-asserted on apply (content columns are fixed),
  // so "none" only means the row already carries the fields the page needs.
  return [
    step('user', state.user !== null, true),
    step(
      'profile',
      state.profile !== null,
      state.profile?.isPublic === true && state.profile.isClaimed === true
    ),
    step('claim', state.claimUserId !== null, true),
    step('release', state.release !== null, true),
    step('release-approval', state.releaseApproved, true),
    step('release-provider-link', state.releaseProviderLink, true),
    step(
      'promo-download',
      state.promoDownload !== null,
      state.promoDownload?.isActive === true
    ),
    step(
      'merch-card',
      state.merchCard !== null,
      state.merchCard?.status === 'live'
    ),
    step(
      'asset-share',
      state.assetShareVisibility !== null,
      state.assetShareVisibility === 'public'
    ),
  ];
}

export interface CrawlContentPageCheck {
  readonly path: string;
  readonly status: number | null;
  readonly attempts: number;
  readonly ok: boolean;
}

export interface CrawlContentFixtureReceipt {
  readonly schema: typeof CRAWL_CONTENT_FIXTURE_RECEIPT_SCHEMA;
  readonly fixtureSchema: typeof CRAWL_CONTENT_FIXTURE_SCHEMA;
  readonly fixtureVersion: number;
  readonly mode: 'dry-run' | 'apply';
  readonly origin: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly handle: string;
  readonly steps: readonly CrawlContentStep[];
  readonly pages: readonly CrawlContentPageCheck[];
  readonly converged: boolean;
}
