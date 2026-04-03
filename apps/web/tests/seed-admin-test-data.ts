import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { campaignSettings } from '@/lib/db/schema/admin';
import { ingestAuditLogs } from '@/lib/db/schema/audit';
import { discogReleases } from '@/lib/db/schema/content';
import { feedbackItems } from '@/lib/db/schema/feedback';
import {
  investorLinks,
  investorSettings,
  investorViews,
} from '@/lib/db/schema/investors';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries, waitlistSettings } from '@/lib/db/schema/waitlist';
import {
  ensureCreatorProfileRecord,
  ensureUserRecord,
  setActiveProfileForUser,
} from '@/lib/testing/test-user-provision.server';

const FIXTURE_BASE_TIME = new Date('2099-01-01T12:00:00.000Z');
const FIXTURE_IMAGE =
  'https://i.scdn.co/image/ab6761610000e5eb0bae7cfd3fb1b2866db6bc8d';

const FIXTURE_USERS = [
  {
    clerkId: 'e2e-admin-user-1',
    email: 'e2e-admin-artist-1@jov.ie',
    name: 'E2E Admin Artist One',
    username: 'e2e-admin-one',
    displayName: 'E2E Admin Artist One',
    bio: 'E2E Admin fixture profile for admin people and releases views.',
  },
  {
    clerkId: 'e2e-admin-user-2',
    email: 'e2e-admin-artist-2@jov.ie',
    name: 'E2E Admin Artist Two',
    username: 'e2e-admin-two',
    displayName: 'E2E Admin Artist Two',
    bio: 'E2E Admin fixture profile for activity and people views.',
  },
] as const;

const WAITLIST_FIXTURES = [
  {
    fullName: 'E2E Admin Waitlist One',
    email: 'e2e-admin-waitlist-1@jov.ie',
    primarySocialUrl: 'https://instagram.com/e2e_admin_waitlist_one',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'instagram.com/e2e_admin_waitlist_one',
    spotifyUrl: 'https://open.spotify.com/artist/4u',
    spotifyUrlNormalized: 'open.spotify.com/artist/4u',
    spotifyArtistName: 'E2E Admin Waitlist One',
    heardAbout: 'Seeded fixture',
    primaryGoal: 'E2E Admin Waitlist Goal',
    selectedPlan: 'pro',
    status: 'new' as const,
    primarySocialFollowerCount: 9200,
  },
  {
    fullName: 'E2E Admin Waitlist Two',
    email: 'e2e-admin-waitlist-2@jov.ie',
    primarySocialUrl: 'https://instagram.com/e2e_admin_waitlist_two',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'instagram.com/e2e_admin_waitlist_two',
    spotifyUrl: 'https://open.spotify.com/artist/4u',
    spotifyUrlNormalized: 'open.spotify.com/artist/4u',
    spotifyArtistName: 'E2E Admin Waitlist Two',
    heardAbout: 'Seeded fixture',
    primaryGoal: 'E2E Admin Creator Launch',
    selectedPlan: 'max',
    status: 'invited' as const,
    primarySocialFollowerCount: 18300,
  },
] as const;

const FEEDBACK_MESSAGES = [
  'E2E Admin Feedback: waitlist operator flow is stable.',
  'E2E Admin Feedback: growth operator queue rendering is stable.',
] as const;

async function seedUsersAndProfiles() {
  const profileIds: string[] = [];

  for (const [index, fixture] of FIXTURE_USERS.entries()) {
    const createdAt = new Date(FIXTURE_BASE_TIME);
    createdAt.setUTCDate(createdAt.getUTCDate() + index);

    const { id: userId } = await ensureUserRecord(db, {
      clerkId: fixture.clerkId,
      email: fixture.email,
      name: fixture.name,
      userStatus: 'active',
      isAdmin: false,
    });

    const profileId = await ensureCreatorProfileRecord(db, {
      userId,
      creatorType: 'artist',
      username: fixture.username,
      usernameNormalized: fixture.username,
      displayName: fixture.displayName,
      bio: fixture.bio,
      venmoHandle: null,
      avatarUrl: FIXTURE_IMAGE,
      spotifyUrl: `https://open.spotify.com/artist/${fixture.clerkId}`,
      appleMusicUrl: null,
      appleMusicId: null,
      youtubeMusicId: null,
      deezerId: null,
      tidalId: null,
      soundcloudId: null,
      isPublic: true,
      isVerified: true,
      isClaimed: true,
      ingestionStatus: 'idle',
      onboardingCompletedAt: createdAt,
    });

    await setActiveProfileForUser(db, userId, profileId);
    await db
      .update(creatorProfiles)
      .set({
        createdAt,
        updatedAt: createdAt,
        avatarUrl: FIXTURE_IMAGE,
        spotifyFollowers: 120_000 + index * 22_000,
        spotifyPopularity: 54 + index * 3,
        genres: ['indie pop', 'alt pop'],
        fitScore: 88 - index * 6,
      })
      .where(eq(creatorProfiles.id, profileId));

    profileIds.push(profileId);
  }

  return profileIds;
}

async function seedReleases(profileIds: readonly string[]) {
  for (const [index, profileId] of profileIds.entries()) {
    const createdAt = new Date(FIXTURE_BASE_TIME);
    createdAt.setUTCDate(createdAt.getUTCDate() + index);
    const slug = `e2e-admin-release-${index + 1}`;

    const [existingRelease] = await db
      .select({ id: discogReleases.id })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, profileId),
          eq(discogReleases.slug, slug)
        )
      )
      .limit(1);

    const releaseValues = {
      creatorProfileId: profileId,
      title: `E2E Admin Release ${index + 1}`,
      slug,
      releaseType: 'single' as const,
      releaseDate: createdAt,
      label: 'E2E Admin Records',
      upc: `E2EADMIN000${index + 1}`,
      totalTracks: 1,
      isExplicit: false,
      artworkUrl: FIXTURE_IMAGE,
      sourceType: 'manual' as const,
      createdAt,
      updatedAt: createdAt,
    };

    if (existingRelease) {
      await db
        .update(discogReleases)
        .set(releaseValues)
        .where(eq(discogReleases.id, existingRelease.id));
    } else {
      await db.insert(discogReleases).values(releaseValues);
    }
  }
}

async function seedWaitlist() {
  await db.delete(waitlistEntries).where(
    inArray(
      waitlistEntries.email,
      WAITLIST_FIXTURES.map(entry => entry.email)
    )
  );

  await db.insert(waitlistEntries).values(
    WAITLIST_FIXTURES.map((entry, index) => {
      const createdAt = new Date(FIXTURE_BASE_TIME);
      createdAt.setUTCDate(createdAt.getUTCDate() + index);

      return {
        ...entry,
        createdAt,
        updatedAt: createdAt,
      };
    })
  );

  const [existingSettings] = await db
    .select({ id: waitlistSettings.id })
    .from(waitlistSettings)
    .limit(1);

  if (!existingSettings) {
    await db.insert(waitlistSettings).values({
      id: 1,
      autoAcceptResetsAt: new Date('2099-01-02T00:00:00.000Z'),
    });
  }
}

async function seedFeedback() {
  await db
    .delete(feedbackItems)
    .where(inArray(feedbackItems.message, [...FEEDBACK_MESSAGES]));

  await db.insert(feedbackItems).values(
    FEEDBACK_MESSAGES.map((message, index) => {
      const createdAt = new Date(FIXTURE_BASE_TIME);
      createdAt.setUTCDate(createdAt.getUTCDate() + index);

      return {
        message,
        source: 'admin-seed',
        status: 'pending' as const,
        context: {
          handle: `e2e-admin-feedback-${index + 1}`,
        },
        createdAt,
        updatedAt: createdAt,
      };
    })
  );
}

async function seedLeads() {
  const fixtures = [
    {
      linktreeHandle: 'e2e-admin-email',
      displayName: 'E2E Admin Email Lead',
      outreachRoute: 'email' as const,
      outreachStatus: 'pending' as const,
      contactEmail: 'e2e-admin-email-lead@jov.ie',
      instagramHandle: 'e2e_admin_email',
      status: 'approved' as const,
      claimToken: 'e2e-admin-email-token',
      emailSuspicious: false,
      hasRepresentation: false,
      priorityScore: 91,
      fitScore: 89,
    },
    {
      linktreeHandle: 'e2e-admin-dm',
      displayName: 'E2E Admin DM Lead',
      outreachRoute: 'dm' as const,
      outreachStatus: 'pending' as const,
      contactEmail: null,
      instagramHandle: 'e2e_admin_dm',
      status: 'approved' as const,
      claimToken: null,
      emailSuspicious: false,
      hasRepresentation: false,
      priorityScore: 84,
      fitScore: 78,
    },
    {
      linktreeHandle: 'e2e-admin-review',
      displayName: 'E2E Admin Review Lead',
      outreachRoute: 'manual_review' as const,
      outreachStatus: 'pending' as const,
      contactEmail: 'e2e-admin-review-lead@jov.ie',
      instagramHandle: 'e2e_admin_review',
      status: 'approved' as const,
      claimToken: null,
      emailSuspicious: true,
      hasRepresentation: true,
      priorityScore: 72,
      fitScore: 64,
    },
  ] as const;

  for (const [index, fixture] of fixtures.entries()) {
    const createdAt = new Date(FIXTURE_BASE_TIME);
    createdAt.setUTCDate(createdAt.getUTCDate() + index);

    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.linktreeHandle, fixture.linktreeHandle))
      .limit(1);

    const values = {
      linktreeHandle: fixture.linktreeHandle,
      linktreeUrl: `https://linktr.ee/${fixture.linktreeHandle}`,
      discoverySource: 'manual' as const,
      discoveryQuery: 'E2E Admin',
      sourcePlatform: 'linktree' as const,
      sourceHandle: fixture.linktreeHandle,
      sourceUrl: `https://linktr.ee/${fixture.linktreeHandle}`,
      displayName: fixture.displayName,
      bio: 'E2E Admin fixture lead for admin growth surfaces.',
      avatarUrl: FIXTURE_IMAGE,
      contactEmail: fixture.contactEmail,
      hasPaidTier: true,
      isLinktreeVerified: true,
      hasSpotifyLink: true,
      spotifyUrl: 'https://open.spotify.com/artist/4u',
      hasInstagram: true,
      instagramHandle: fixture.instagramHandle,
      musicToolsDetected: ['feature-fm'],
      hasTrackingPixels: true,
      trackingPixelPlatforms: ['meta'],
      fitScore: fixture.fitScore,
      status: fixture.status,
      approvedAt: createdAt,
      outreachRoute: fixture.outreachRoute,
      outreachStatus: fixture.outreachStatus,
      claimToken: fixture.claimToken,
      claimTokenHash: fixture.claimToken,
      outreachQueuedAt: null,
      priorityScore: fixture.priorityScore,
      emailInvalid: false,
      emailSuspicious: fixture.emailSuspicious,
      hasRepresentation: fixture.hasRepresentation,
      attributionStatus: 'unattributed' as const,
      scrapeAttempts: 1,
      scrapedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };

    if (existingLead) {
      await db.update(leads).set(values).where(eq(leads.id, existingLead.id));
    } else {
      await db.insert(leads).values(values);
    }
  }

  const [existingSettings] = await db
    .select({ id: leadPipelineSettings.id })
    .from(leadPipelineSettings)
    .limit(1);

  if (!existingSettings) {
    await db.insert(leadPipelineSettings).values({
      id: 1,
      enabled: true,
      queryBudgetResetsAt: new Date('2099-01-02T00:00:00.000Z'),
      autoIngestResetsAt: new Date('2099-01-02T00:00:00.000Z'),
    });
  }
}

async function seedInvestors() {
  const createdAt = new Date(FIXTURE_BASE_TIME);

  const [existingLink] = await db
    .select({ id: investorLinks.id })
    .from(investorLinks)
    .where(eq(investorLinks.token, 'e2e-admin-investor-link'))
    .limit(1);

  const linkValues = {
    token: 'e2e-admin-investor-link',
    label: 'E2E Admin Investor Link',
    email: 'e2e-admin-investor@jov.ie',
    investorName: 'E2E Admin Capital',
    stage: 'engaged' as const,
    engagementScore: 61,
    notes: 'Seeded admin fixture',
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };

  let linkId = existingLink?.id ?? null;

  if (existingLink) {
    await db
      .update(investorLinks)
      .set(linkValues)
      .where(eq(investorLinks.id, existingLink.id));
  } else {
    const [createdLink] = await db
      .insert(investorLinks)
      .values(linkValues)
      .returning({ id: investorLinks.id });
    linkId = createdLink.id;
  }

  if (linkId) {
    await db
      .delete(investorViews)
      .where(eq(investorViews.investorLinkId, linkId));
    await db.insert(investorViews).values({
      investorLinkId: linkId,
      pagePath: '/deck',
      durationHintMs: 48_000,
      userAgent: 'seed-admin-test-data',
      referrer: 'https://jov.ie/app/admin',
      viewedAt: new Date('2099-01-01T12:30:00.000Z'),
    });
  }

  const [existingSettings] = await db
    .select({ id: investorSettings.id })
    .from(investorSettings)
    .limit(1);

  if (!existingSettings) {
    await db.insert(investorSettings).values({
      showProgressBar: true,
      raiseTarget: 500000,
      committedAmount: 175000,
      investorCount: 12,
      bookCallUrl: 'https://cal.com/e2e-admin/fundraise',
      investUrl: 'https://jov.ie/invest/e2e-admin',
      followupEnabled: true,
      followupDelayHours: 48,
      engagedThreshold: 50,
    });
  }
}

async function ensureCampaignSettings() {
  const [existingSettings] = await db
    .select({ id: campaignSettings.id })
    .from(campaignSettings)
    .limit(1);

  if (!existingSettings) {
    await db.insert(campaignSettings).values({
      id: 1,
    });
  }
}

async function seedIngestHistory() {
  const handles = ['e2e-admin-one', 'e2e-admin-two'];

  await db
    .delete(ingestAuditLogs)
    .where(inArray(ingestAuditLogs.handle, handles));

  await db.insert(ingestAuditLogs).values(
    handles.map((handle, index) => {
      const createdAt = new Date(FIXTURE_BASE_TIME);
      createdAt.setUTCMinutes(createdAt.getUTCMinutes() + index * 5);

      return {
        type:
          index === 0 ? 'ARTIST_CLAIM_SUCCESS' : 'ARTIST_DATA_REFRESH_FAILED',
        level: index === 0 ? 'info' : 'error',
        spotifyId: `e2e-admin-spotify-${index + 1}`,
        handle,
        action: 'admin_seed',
        result: index === 0 ? 'success' : 'failed',
        failureReason:
          index === 0 ? null : 'E2E Admin refresh fixture failure reason',
        userAgent: 'seed-admin-test-data',
        createdAt,
      };
    })
  );
}

async function main() {
  const profileIds = await seedUsersAndProfiles();
  await seedReleases(profileIds);
  await seedWaitlist();
  await seedFeedback();
  await seedLeads();
  await seedInvestors();
  await ensureCampaignSettings();
  await seedIngestHistory();

  console.log(
    JSON.stringify(
      {
        ok: true,
        profilesSeeded: profileIds.length,
        waitlistSeeded: WAITLIST_FIXTURES.length,
        feedbackSeeded: FEEDBACK_MESSAGES.length,
        seededAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error('[seed-admin-test-data] failed', error);
  process.exit(1);
});
