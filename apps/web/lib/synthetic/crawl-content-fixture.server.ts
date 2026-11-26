import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  discogReleases,
  providerLinks,
  providers,
} from '@/lib/db/schema/content';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';
import { libraryAssetShareSettings } from '@/lib/db/schema/library-asset-share';
import { merchCards } from '@/lib/db/schema/merch';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import { updateLibraryAssetShareVisibility } from '@/lib/library/asset-share.server';
import {
  buildCrawlFixtureMerchSnapshots,
  CRAWL_CONTENT_FIXTURE,
  CRAWL_FIXTURE_MERCH_IMAGE_PATH,
  CRAWL_FIXTURE_PLAN,
  CRAWL_FIXTURE_RELEASE_ARTWORK_PATH,
  CRAWL_FIXTURE_TRIAL_ENDS_AT,
  type CrawlContentFixture,
  type CrawlContentObservedState,
  type CrawlContentStep,
  crawlFixtureUserHasDownloadPlan,
  planCrawlContentFixture,
} from './crawl-content-fixture';

/**
 * Crawl content fixture reconciler. Every write is keyed to the fixture:
 * the user by exact address, the profile by the reserved handle bound to
 * that user, and content rows by the fixed ids in the JSON spec. The plan's
 * ownership guard runs before any write.
 */

const RELEASE_DATE = new Date('2026-01-01T00:00:00.000Z');
// The promo rights attestation is immutable once set, so it carries a fixed
// timestamp: re-running apply writes the same value and the guard allows it.
const RIGHTS_ATTESTED_AT = RELEASE_DATE;

export async function readCrawlContentFixtureState(
  fixture: CrawlContentFixture = CRAWL_CONTENT_FIXTURE
): Promise<CrawlContentObservedState> {
  const [userRow] = await db
    .select({
      id: users.id,
      plan: users.plan,
      isPro: users.isPro,
      trialEndsAt: users.trialEndsAt,
      stripeSubscriptionId: users.stripeSubscriptionId,
    })
    .from(users)
    .where(drizzleSql`lower(trim(${users.email})) = ${fixture.email}`)
    .limit(1);

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, fixture.handle))
    .limit(1);

  const [claim] = profile
    ? await db
        .select({ userId: userProfileClaims.userId })
        .from(userProfileClaims)
        .where(eq(userProfileClaims.creatorProfileId, profile.id))
        .limit(1)
    : [];

  const [release] = await db
    .select({ creatorProfileId: discogReleases.creatorProfileId })
    .from(discogReleases)
    .where(eq(discogReleases.id, fixture.release.id))
    .limit(1);

  const [approval] = profile
    ? await db
        .select({ id: libraryAssetApprovalStatuses.id })
        .from(libraryAssetApprovalStatuses)
        .where(
          and(
            eq(libraryAssetApprovalStatuses.creatorProfileId, profile.id),
            eq(libraryAssetApprovalStatuses.assetId, fixture.release.id),
            eq(libraryAssetApprovalStatuses.approvalStatus, 'approved'),
            eq(libraryAssetApprovalStatuses.profileVisibility, 'visible')
          )
        )
        .limit(1)
    : [];

  const [link] = await db
    .select({ id: providerLinks.id })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.releaseId, fixture.release.id),
        eq(providerLinks.ownerType, 'release')
      )
    )
    .limit(1);

  const [promo] = await db
    .select({
      creatorProfileId: promoDownloads.creatorProfileId,
      isActive: promoDownloads.isActive,
    })
    .from(promoDownloads)
    .where(eq(promoDownloads.id, fixture.promoDownload.id))
    .limit(1);

  const [merch] = await db
    .select({
      creatorProfileId: merchCards.creatorProfileId,
      status: merchCards.status,
    })
    .from(merchCards)
    .where(eq(merchCards.id, fixture.merchCard.id))
    .limit(1);

  const [share] = profile
    ? await db
        .select({ visibility: libraryAssetShareSettings.visibility })
        .from(libraryAssetShareSettings)
        .where(
          and(
            eq(libraryAssetShareSettings.creatorProfileId, profile.id),
            eq(libraryAssetShareSettings.assetId, fixture.release.id)
          )
        )
        .limit(1)
    : [];

  const user = userRow
    ? {
        id: userRow.id,
        hasDownloadPlan: crawlFixtureUserHasDownloadPlan(userRow),
      }
    : null;

  return {
    user,
    profile: profile ?? null,
    claimUserId: claim?.userId ?? null,
    release: release ?? null,
    releaseApproved: Boolean(approval),
    releaseProviderLink: Boolean(link),
    promoDownload: promo ?? null,
    merchCard: merch ?? null,
    assetShareVisibility: share?.visibility ?? null,
  };
}

async function writeFixture(fixture: CrawlContentFixture): Promise<void> {
  const now = new Date();

  // User: a trial that never lapses is what the download gate reads (see
  // CRAWL_FIXTURE_PLAN). No Stripe customer or subscription, so nothing bills.
  const userValues = {
    clerkId: fixture.clerkId,
    email: fixture.email,
    name: fixture.displayName,
    userStatus: 'active' as const,
    isAdmin: false,
    isPro: false,
    plan: CRAWL_FIXTURE_PLAN,
    trialEndsAt: CRAWL_FIXTURE_TRIAL_ENDS_AT,
    stripeSubscriptionId: null,
    updatedAt: now,
  };
  const [user] = await db
    .insert(users)
    .values(userValues)
    .onConflictDoUpdate({ target: users.email, set: userValues })
    .returning({ id: users.id });

  const profileValues = {
    userId: user.id,
    creatorType: 'artist' as const,
    username: fixture.handle,
    usernameNormalized: fixture.handle,
    displayName: fixture.displayName,
    bio: 'Demo artist Jovie uses to check its own pages. Not a real artist.',
    avatarUrl: '/avatars/default-user.png',
    isPublic: true,
    isVerified: false,
    isClaimed: true,
    onboardingCompletedAt: now,
    settings: { searchable: false },
    updatedAt: now,
  };
  const [existingProfile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, fixture.handle))
    .limit(1);
  const profileId = existingProfile
    ? (
        await db
          .update(creatorProfiles)
          .set(profileValues)
          .where(eq(creatorProfiles.id, existingProfile.id))
          .returning({ id: creatorProfiles.id })
      )[0].id
    : (
        await db
          .insert(creatorProfiles)
          .values(profileValues)
          .returning({ id: creatorProfiles.id })
      )[0].id;

  await db
    .insert(userProfileClaims)
    .values({
      userId: user.id,
      creatorProfileId: profileId,
      role: 'owner',
      claimedAt: now,
    })
    .onConflictDoNothing();
  await db
    .update(users)
    .set({ activeProfileId: profileId, updatedAt: now })
    .where(eq(users.id, user.id));

  const releaseValues = {
    creatorProfileId: profileId,
    title: fixture.release.title,
    slug: fixture.release.slug,
    releaseType: 'single' as const,
    releaseDate: RELEASE_DATE,
    status: 'released',
    deletedAt: null,
    artworkUrl: CRAWL_FIXTURE_RELEASE_ARTWORK_PATH,
    totalTracks: 1,
    sourceType: 'manual' as const,
    updatedAt: now,
  };
  await db
    .insert(discogReleases)
    .values({ id: fixture.release.id, ...releaseValues })
    .onConflictDoUpdate({ target: discogReleases.id, set: releaseValues });

  await db
    .insert(libraryAssetApprovalStatuses)
    .values({
      creatorProfileId: profileId,
      assetId: fixture.release.id,
      itemKind: 'release',
      approvalStatus: 'approved',
      profileVisibility: 'visible',
    })
    .onConflictDoUpdate({
      target: [
        libraryAssetApprovalStatuses.creatorProfileId,
        libraryAssetApprovalStatuses.assetId,
      ],
      set: {
        itemKind: 'release',
        approvalStatus: 'approved',
        profileVisibility: 'visible',
        updatedAt: now,
      },
    });

  // A Spotify search link: the release-eligibility rule needs one provider
  // link, and a search names no real artist's catalog.
  await db
    .insert(providers)
    .values({
      id: 'spotify',
      displayName: 'Spotify',
      kind: 'music_streaming',
      baseUrl: 'https://open.spotify.com',
    })
    .onConflictDoNothing();
  await db
    .insert(providerLinks)
    .values({
      providerId: 'spotify',
      ownerType: 'release',
      releaseId: fixture.release.id,
      url: `https://open.spotify.com/search/${encodeURIComponent(fixture.displayName)}`,
      isPrimary: true,
      sourceType: 'manual',
    })
    .onConflictDoNothing();

  const promoValues = {
    creatorProfileId: profileId,
    releaseId: fixture.release.id,
    title: fixture.promoDownload.title,
    slug: fixture.promoDownload.slug,
    // A Blob pathname that is never uploaded: the gate page lists the file,
    // and only a submitted email would ever ask for a download URL.
    fileUrl: `crawl-fixture/${fixture.promoDownload.fileName}`,
    fileName: fixture.promoDownload.fileName,
    fileMimeType: 'audio/mpeg',
    isActive: true,
    // Active downloads must carry a full-control rights attestation. The
    // fixture's own account attests for a placeholder file Jovie made and
    // never uploaded, which no one else holds rights to.
    rightsControlAttested: true,
    rightsControlAttestedBy: user.id,
    rightsControlAttestedAt: RIGHTS_ATTESTED_AT,
    position: 0,
    updatedAt: now,
  };
  await db
    .insert(promoDownloads)
    .values({ id: fixture.promoDownload.id, ...promoValues })
    .onConflictDoUpdate({ target: promoDownloads.id, set: promoValues });

  const snapshots = buildCrawlFixtureMerchSnapshots();
  const merchValues = {
    creatorProfileId: profileId,
    createdByClerkUserId: fixture.clerkId,
    status: 'live' as const,
    title: fixture.merchCard.title,
    description: 'Demo item Jovie uses to check its merch page. Not for sale.',
    productType: 'T-shirt',
    primaryImageUrl: CRAWL_FIXTURE_MERCH_IMAGE_PATH,
    mockupUrls: [CRAWL_FIXTURE_MERCH_IMAGE_PATH],
    printful: snapshots.printful,
    retailPriceCents: snapshots.pricing.retailPriceCents,
    estimatedPrintfulProductCostCents: 0,
    pricing: snapshots.pricing,
    learning: snapshots.learning,
    publishedAt: now,
    pausedAt: null,
    archivedAt: null,
    updatedAt: now,
  };
  await db
    .insert(merchCards)
    .values({ id: fixture.merchCard.id, ...merchValues })
    .onConflictDoUpdate({ target: merchCards.id, set: merchValues });

  await updateLibraryAssetShareVisibility({
    creatorProfileId: profileId,
    assetId: fixture.release.id,
    visibility: 'public',
    artistHandle: fixture.handle,
    itemKind: 'release',
    title: fixture.release.title,
    smartLinkPath: `/${fixture.handle}/${fixture.release.slug}`,
  });
}

export async function reconcileCrawlContentFixture(input: {
  readonly apply: boolean;
  readonly fixture?: CrawlContentFixture;
}): Promise<{
  readonly steps: CrawlContentStep[];
  readonly converged: boolean;
}> {
  const fixture = input.fixture ?? CRAWL_CONTENT_FIXTURE;
  const before = await readCrawlContentFixtureState(fixture);
  const steps = planCrawlContentFixture(before, fixture);
  if (!input.apply) {
    return { steps, converged: steps.every(s => s.action === 'none') };
  }
  await writeFixture(fixture);
  const after = planCrawlContentFixture(
    await readCrawlContentFixtureState(fixture),
    fixture
  );
  return { steps, converged: after.every(s => s.action === 'none') };
}
