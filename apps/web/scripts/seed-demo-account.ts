#!/usr/bin/env -S tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Demo Account Seed Script
 *
 * Seeds a comprehensive, realistic demo account for product demos and screenshots.
 * Designed to be idempotent — safe to re-run. Cleans child data on each run.
 *
 * Usage:
 *   doppler run -- pnpm tsx apps/web/scripts/seed-demo-account.ts
 *
 * Prerequisites:
 *   - DATABASE_URL must be set
 *   - DEMO_CLERK_USER_ID must be set (from setup-demo-user.ts)
 */

import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';
import {
  type DemoPersonaRelease,
  type DemoPersonaTourDate,
  INTERNAL_DJ_DEMO_PERSONA,
} from '@/lib/demo-personas';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';

const {
  users,
  creatorProfiles,
  creatorContacts,
  socialLinks,
  discogReleases,
  discogTracks,
  providerLinks,
  tourDates,
  audienceMembers,
  clickEvents,
  dailyProfileViews,
  notificationSubscriptions,
  tips,
  tipAudience,
  emailThreads,
  inboundEmails,
  chatConversations,
  chatMessages,
  aiInsights,
  insightGenerationRuns,
  referralCodes,
  referrals,
  referralCommissions,
  emailEngagement,
  fanReleaseNotifications,
  preSaveTokens,
  dspArtistMatches,
  releaseTasks,
} = schema;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_USERNAME = INTERNAL_DJ_DEMO_PERSONA.profile.handle;
const DEMO_DISPLAY_NAME = INTERNAL_DJ_DEMO_PERSONA.profile.displayName;
const DEMO_EMAIL = 'demo@jov.ie';
const DEMO_REFERRED_EMAILS = Array.from(
  { length: 3 },
  (_, index) => `demo.referred.${index}@example.com`
);
const DEMO_PROFILE = INTERNAL_DJ_DEMO_PERSONA.profile;

const FAN_NAMES = [
  'Sarah M.',
  'James K.',
  'Emma L.',
  'Marcus T.',
  'Olivia R.',
  'Noah P.',
  'Sophia W.',
  'Liam H.',
  'Isabella C.',
  'Ethan B.',
  'Mia D.',
  'Alexander J.',
  'Charlotte F.',
  'Benjamin S.',
  'Amelia G.',
  'Lucas N.',
  'Harper V.',
  'Mason Z.',
  'Evelyn Q.',
  'Logan A.',
  'Avery E.',
  'Jackson Y.',
  'Scarlett I.',
  'Aiden O.',
  'Luna U.',
  'Sebastian X.',
  'Aria W.',
  'Mateo R.',
  'Chloe T.',
  'Jack P.',
  'Penelope H.',
  'Owen F.',
  'Layla M.',
  'Daniel K.',
  'Riley S.',
  'Henry J.',
  'Zoey B.',
  'Samuel D.',
  'Nora G.',
  'Carter L.',
  'Lily N.',
  'Wyatt C.',
  'Eleanor V.',
  'Grayson A.',
  'Hannah Z.',
  'Dylan E.',
  'Addison Q.',
  'Leo I.',
  'Aubrey O.',
  'Jaxon U.',
];

const EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'icloud.com',
  'yahoo.com',
  'proton.me',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hockey-stick date distribution: bias toward recent dates */
function hockeyStickDate(daysBack: number): Date {
  const d = new Date();
  const offset = Math.floor(daysBack * Math.random() ** 2);
  d.setDate(d.getDate() - offset);
  d.setHours(
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
    0
  );
  return d;
}

/** Generate a fan email from a FAN_NAMES entry */
function fanEmail(name: string): string {
  const parts = name.toLowerCase().replace('.', '').split(' ');
  const domain =
    EMAIL_DOMAINS[Math.floor(Math.random() * EMAIL_DOMAINS.length)];
  return `${parts[0]}.${parts[1]}@${domain}`;
}

/** Pick a geographic country with the specified distribution */
function pickCountry(): string {
  const r = Math.random();
  if (r < 0.4) return 'US';
  if (r < 0.55) return 'GB';
  if (r < 0.65) return 'CA';
  if (r < 0.75) return 'AU';
  // Rest: DE, FR, JP, BR, MX
  const rest = ['DE', 'FR', 'JP', 'BR', 'MX'];
  return rest[Math.floor(Math.random() * rest.length)];
}

function pickCity(country: string): string {
  const cityMap: Record<string, string[]> = {
    US: [
      'Los Angeles',
      'New York',
      'San Francisco',
      'Nashville',
      'Austin',
      'Chicago',
      'Portland',
      'Seattle',
    ],
    GB: ['London', 'Manchester', 'Bristol', 'Brighton'],
    CA: ['Toronto', 'Vancouver', 'Montreal'],
    AU: ['Sydney', 'Melbourne', 'Brisbane'],
    DE: ['Berlin', 'Munich', 'Hamburg'],
    FR: ['Paris', 'Lyon', 'Marseille'],
    JP: ['Tokyo', 'Osaka', 'Kyoto'],
    BR: ['Sao Paulo', 'Rio de Janeiro'],
    MX: ['Mexico City', 'Guadalajara'],
  };
  const cities = cityMap[country] ?? ['Unknown'];
  return cities[Math.floor(Math.random() * cities.length)];
}

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

const DEMO_CLERK_USER_ID = process.env.DEMO_CLERK_USER_ID;
if (!DEMO_CLERK_USER_ID) {
  console.error(
    'DEMO_CLERK_USER_ID not configured. Run setup-demo-user.ts first.'
  );
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

// ---------------------------------------------------------------------------
// Tour dates sourced from the internal Calvin Harris demo persona.
// ---------------------------------------------------------------------------

const TEST_TOUR_DATES: readonly DemoPersonaTourDate[] =
  INTERNAL_DJ_DEMO_PERSONA.tourDates;

// ---------------------------------------------------------------------------
// Release data (copied from seed-test-data.ts)
// ---------------------------------------------------------------------------

const TEST_RELEASES: readonly DemoPersonaRelease[] =
  INTERNAL_DJ_DEMO_PERSONA.releases;

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedDemoUser(): Promise<string> {
  console.log('  Seeding demo user...');

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, DEMO_CLERK_USER_ID!))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        email: DEMO_EMAIL,
        name: DEMO_DISPLAY_NAME,
        userStatus: 'active',
        isPro: true,
        plan: 'pro',
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`    Updated existing user (ID: ${existing.id})`);
    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkId: DEMO_CLERK_USER_ID!,
      email: DEMO_EMAIL,
      name: DEMO_DISPLAY_NAME,
      userStatus: 'active',
      isPro: true,
      plan: 'pro',
    })
    .returning({ id: users.id });

  console.log(`    Created user (ID: ${created.id})`);
  return created.id;
}

async function seedDemoProfile(userId: string): Promise<string> {
  console.log('  Seeding demo profile...');

  // Safety: check if the internal demo handle exists and belongs to someone else
  const [existingProfile] = await db
    .select({ id: creatorProfiles.id, userId: creatorProfiles.userId })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, DEMO_USERNAME.toLowerCase()))
    .limit(1);

  if (
    existingProfile &&
    existingProfile.userId &&
    existingProfile.userId !== userId
  ) {
    console.error(
      `    ABORT: Username '${DEMO_USERNAME}' belongs to another user (userId: ${existingProfile.userId})`
    );
    process.exit(1);
  }

  const avatarUrl = DEMO_PROFILE.avatarSrc;
  const spotifyId = DEMO_PROFILE.spotifyArtistId;
  const spotifyUrl = DEMO_PROFILE.spotifyUrl;
  const profileGenres = [...DEMO_PROFILE.genres];
  const location = DEMO_PROFILE.location;

  let spotifyIdForProfile = spotifyId;
  let spotifyUrlForProfile = spotifyUrl;

  if (spotifyId) {
    const [spotifyOwner] = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.spotifyId, spotifyId))
      .limit(1);

    if (spotifyOwner && spotifyOwner.id !== existingProfile?.id) {
      console.log(
        `    Spotify ID already belongs to @${spotifyOwner.username ?? 'unknown'}; keeping demo profile detached from the canonical Spotify link`
      );
      spotifyIdForProfile = null;
      spotifyUrlForProfile = null;
    }
  }

  const profileData = {
    userId,
    username: DEMO_USERNAME,
    usernameNormalized: DEMO_USERNAME.toLowerCase(),
    displayName: DEMO_DISPLAY_NAME,
    bio: DEMO_PROFILE.bio,
    avatarUrl,
    spotifyId: spotifyIdForProfile,
    spotifyUrl: spotifyUrlForProfile,
    genres: profileGenres,
    location,
    creatorType: 'artist' as const,
    isPublic: true,
    isVerified: true,
    isFeatured: DEMO_PROFILE.isFeaturedByDefault,
    isClaimed: DEMO_PROFILE.isClaimedByDefault,
    avatarLockedByUser: true,
    ingestionStatus: 'idle' as const,
    stripeAccountId: 'acct_demo_calvin',
    stripeOnboardingComplete: true,
    stripePayoutsEnabled: true,
    venmoHandle: DEMO_PROFILE.venmoHandle,
    onboardingCompletedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existingProfile) {
    await db
      .update(creatorProfiles)
      .set(profileData)
      .where(eq(creatorProfiles.id, existingProfile.id));
    console.log(`    Updated existing profile (ID: ${existingProfile.id})`);
    return existingProfile.id;
  }

  const [created] = await db
    .insert(creatorProfiles)
    .values(profileData)
    .returning({ id: creatorProfiles.id });
  console.log(`    Created profile (ID: ${created.id})`);
  return created.id;
}

async function cleanDemoChildData(profileId: string, userId: string) {
  console.log('  Cleaning child data for re-run safety...');

  // Delete from all child tables that reference this profile
  await db
    .delete(clickEvents)
    .where(eq(clickEvents.creatorProfileId, profileId));
  await db
    .delete(audienceMembers)
    .where(eq(audienceMembers.creatorProfileId, profileId));
  await db.delete(tips).where(eq(tips.creatorProfileId, profileId));
  await db.delete(tipAudience).where(eq(tipAudience.profileId, profileId));
  await db
    .delete(notificationSubscriptions)
    .where(eq(notificationSubscriptions.creatorProfileId, profileId));
  await db
    .delete(dailyProfileViews)
    .where(eq(dailyProfileViews.creatorProfileId, profileId));
  await db
    .delete(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profileId));
  await db.delete(tourDates).where(eq(tourDates.profileId, profileId));
  await db
    .delete(creatorContacts)
    .where(eq(creatorContacts.creatorProfileId, profileId));
  await db
    .delete(emailThreads)
    .where(eq(emailThreads.creatorProfileId, profileId));
  await db
    .delete(inboundEmails)
    .where(eq(inboundEmails.creatorProfileId, profileId));
  await db
    .delete(chatConversations)
    .where(eq(chatConversations.creatorProfileId, profileId));
  await db.delete(aiInsights).where(eq(aiInsights.creatorProfileId, profileId));
  await db
    .delete(insightGenerationRuns)
    .where(eq(insightGenerationRuns.creatorProfileId, profileId));
  await db
    .delete(fanReleaseNotifications)
    .where(eq(fanReleaseNotifications.creatorProfileId, profileId));
  await db
    .delete(dspArtistMatches)
    .where(eq(dspArtistMatches.creatorProfileId, profileId));
  // Releases cascade-delete tracks and provider links
  await db
    .delete(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId));
  // Referrals
  const existingReferralRows = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId));
  const existingReferralIds = existingReferralRows.map(row => row.id);
  if (existingReferralIds.length > 0) {
    await db
      .delete(referralCommissions)
      .where(inArray(referralCommissions.referralId, existingReferralIds));
    await db
      .delete(referrals)
      .where(inArray(referrals.id, existingReferralIds));
  }
  await db.delete(referralCodes).where(eq(referralCodes.userId, userId));

  const existingReferredUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, DEMO_REFERRED_EMAILS));
  const existingReferredUserIds = existingReferredUsers.map(row => row.id);
  if (existingReferredUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, existingReferredUserIds));
  }

  console.log('    Cleaned all child data');
}

async function seedDemoContacts(profileId: string): Promise<string[]> {
  console.log('  Seeding contacts...');

  const contactData = [
    {
      creatorProfileId: profileId,
      role: 'bookings' as const,
      personName: 'Mike Chen',
      companyName: 'Live Nation Touring',
      email: 'bookings@livenationtouring.example.com',
      territories: ['US', 'CA'],
      forwardInboxEmails: true,
      isActive: true,
      sortOrder: 0,
    },
    {
      creatorProfileId: profileId,
      role: 'management' as const,
      personName: 'Sarah Johnson',
      companyName: 'Maverick Management',
      email: 'sarah@maverickmanagement.example.com',
      territories: ['US', 'UK', 'EU'],
      isActive: true,
      sortOrder: 1,
    },
    {
      creatorProfileId: profileId,
      role: 'press_pr' as const,
      personName: 'Amanda Torres',
      companyName: 'Shore Fire Media',
      email: 'amanda@shorefiremedia.example.com',
      territories: ['US', 'UK'],
      isActive: true,
      sortOrder: 2,
    },
  ];

  const ids: string[] = [];
  for (const contact of contactData) {
    const [created] = await db
      .insert(creatorContacts)
      .values(contact)
      .returning({ id: creatorContacts.id });
    ids.push(created.id);
  }

  console.log(`    Created ${ids.length} contacts`);
  return ids;
}

async function seedDemoReleases(profileId: string): Promise<string[]> {
  console.log('  Seeding releases...');

  const seededReleaseIds: string[] = [];

  for (const release of TEST_RELEASES) {
    const [created] = await db
      .insert(discogReleases)
      .values({
        creatorProfileId: profileId,
        title: release.title,
        slug: `demo-${release.slug}`,
        releaseType: release.releaseType,
        releaseDate: new Date(release.releaseDate),
        artworkUrl: release.artworkUrl,
        totalTracks: release.totalTracks,
        upc: release.upc ? `DEMO${release.upc}` : undefined,
        label: release.label ?? undefined,
        metadata: release.metadata ?? {},
        sourceType: 'manual',
      })
      .returning({ id: discogReleases.id });
    seededReleaseIds.push(created.id);

    const providerRows = Object.entries(release.providerUrls).map(
      ([providerId, url], index) => ({
        providerId,
        ownerType: 'release' as const,
        releaseId: created.id,
        url,
        isPrimary: index === 0,
        sourceType: 'manual' as const,
      })
    );

    if (providerRows.length > 0) {
      await db.insert(providerLinks).values(providerRows).onConflictDoNothing();
    }

    if (release.tracks && release.tracks.length > 0) {
      await db
        .insert(discogTracks)
        .values(
          release.tracks.map(track => ({
            releaseId: created.id,
            creatorProfileId: profileId,
            title: track.title,
            slug: track.slug,
            trackNumber: track.trackNumber,
            discNumber: track.discNumber,
            durationMs: track.durationMs,
            isrc: track.isrc,
            isExplicit: Boolean(track.isExplicit),
            sourceType: 'manual' as const,
          }))
        )
        .onConflictDoNothing();
    }
  }

  console.log(`    Created ${seededReleaseIds.length} demo releases`);
  return seededReleaseIds;
}

async function seedDemoReleaseTasks(
  profileId: string,
  releaseIds: string[]
): Promise<void> {
  console.log('  Seeding release tasks...');

  for (const releaseId of releaseIds) {
    await db.delete(releaseTasks).where(eq(releaseTasks.releaseId, releaseId));

    const [release] = await db
      .select({ releaseDate: discogReleases.releaseDate })
      .from(discogReleases)
      .where(eq(discogReleases.id, releaseId))
      .limit(1);

    const releaseDate = release?.releaseDate
      ? new Date(release.releaseDate)
      : null;

    await db.insert(releaseTasks).values(
      DEFAULT_RELEASE_TASK_TEMPLATE.map((item, index) => ({
        releaseId,
        creatorProfileId: profileId,
        title: item.title,
        description: item.description ?? null,
        explainerText: item.explainerText ?? null,
        learnMoreUrl: item.learnMoreUrl ?? null,
        category: item.category,
        status:
          item.assigneeType === 'ai_workflow'
            ? ('done' as const)
            : ('todo' as const),
        priority: item.priority,
        position: index,
        assigneeType: item.assigneeType,
        aiWorkflowId: item.aiWorkflowId ?? null,
        dueDaysOffset: item.dueDaysOffset,
        dueDate: releaseDate
          ? new Date(
              releaseDate.getTime() + item.dueDaysOffset * 24 * 60 * 60 * 1000
            )
          : null,
        completedAt: item.assigneeType === 'ai_workflow' ? new Date() : null,
      }))
    );
  }

  console.log(
    `    Seeded ${DEFAULT_RELEASE_TASK_TEMPLATE.length} tasks across ${releaseIds.length} releases`
  );
}

async function seedDemoSocialLinks(profileId: string): Promise<string[]> {
  console.log('  Seeding social links...');

  const links = INTERNAL_DJ_DEMO_PERSONA.socialLinks.map(link => ({
    ...link,
    clicks: 50 + Math.floor(Math.random() * 450),
  }));

  const ids: string[] = [];
  for (const link of links) {
    const [created] = await db
      .insert(socialLinks)
      .values({
        creatorProfileId: profileId,
        platform: link.platform,
        platformType: link.platformType,
        url: link.url,
        displayText: link.displayText,
        sortOrder: link.sortOrder,
        clicks: link.clicks,
        isActive: true,
        state: 'active',
      })
      .returning({ id: socialLinks.id });
    ids.push(created.id);
  }

  console.log(`    Created ${ids.length} social links`);
  return ids;
}

async function seedDemoTourDates(profileId: string) {
  console.log('  Seeding tour dates...');

  for (const td of TEST_TOUR_DATES) {
    await db
      .insert(tourDates)
      .values({
        profileId,
        externalId: td.externalId,
        title: td.title,
        venueName: td.venueName,
        city: td.city,
        region: td.region,
        country: td.country,
        provider: td.provider,
        ticketStatus: td.ticketStatus,
        ticketUrl: td.ticketUrl,
        latitude: td.latitude,
        longitude: td.longitude,
        timezone: td.timezone,
        startDate: new Date(td.startDate),
        startTime: td.startTime,
      })
      .onConflictDoNothing();
  }

  console.log(`    Created ${TEST_TOUR_DATES.length} tour dates`);
}

async function seedDemoSubscribers(profileId: string): Promise<string[]> {
  console.log('  Seeding notification subscribers...');

  const subscriberIds: string[] = [];

  // 120 email subscribers
  const emailRows = [];
  for (let i = 0; i < 120; i++) {
    const name = FAN_NAMES[i % FAN_NAMES.length];
    const country = pickCountry();
    const city = pickCity(country);
    const createdAt = hockeyStickDate(90);
    const confirmed = Math.random() < 0.8;
    const sources = ['website', 'qr_code', 'instagram_bio', 'tiktok_bio'];
    const sourceWeights = [0.4, 0.2, 0.25, 0.15];
    let source = sources[0];
    const r = Math.random();
    let cumulative = 0;
    for (let s = 0; s < sourceWeights.length; s++) {
      cumulative += sourceWeights[s];
      if (r < cumulative) {
        source = sources[s];
        break;
      }
    }

    emailRows.push({
      creatorProfileId: profileId,
      channel: 'email' as const,
      email: `demo.sub.${i}.${fanEmail(name)}`,
      name,
      countryCode: country,
      city,
      source,
      confirmedAt: confirmed ? createdAt : null,
      createdAt,
    });
  }

  // 30 SMS subscribers
  const smsRows = [];
  for (let i = 0; i < 30; i++) {
    const name = FAN_NAMES[i % FAN_NAMES.length];
    const country = pickCountry();
    const city = pickCity(country);
    const createdAt = hockeyStickDate(90);
    const confirmed = Math.random() < 0.8;

    smsRows.push({
      creatorProfileId: profileId,
      channel: 'sms' as const,
      phone: `+1555${String(1000 + i).padStart(7, '0')}`,
      name,
      countryCode: country,
      city,
      source: 'website',
      confirmedAt: confirmed ? createdAt : null,
      createdAt,
    });
  }

  if (emailRows.length > 0) {
    const created = await db
      .insert(notificationSubscriptions)
      .values(emailRows)
      .onConflictDoNothing()
      .returning({ id: notificationSubscriptions.id });
    subscriberIds.push(...created.map(c => c.id));
  }
  if (smsRows.length > 0) {
    const created = await db
      .insert(notificationSubscriptions)
      .values(smsRows)
      .onConflictDoNothing()
      .returning({ id: notificationSubscriptions.id });
    subscriberIds.push(...created.map(c => c.id));
  }

  console.log(`    Created ${emailRows.length + smsRows.length} subscribers`);
  return subscriberIds;
}

async function seedDemoAudience(profileId: string): Promise<string[]> {
  console.log('  Seeding audience members...');

  const memberTypes = [
    'anonymous',
    'email',
    'sms',
    'spotify',
    'customer',
  ] as const;
  const deviceTypes = ['mobile', 'desktop', 'tablet', 'unknown'] as const;
  const audienceRows = [];

  for (let i = 0; i < 400; i++) {
    // Type distribution: 40% anonymous, 25% email, 15% spotify, 10% customer, 10% sms
    let memberType: (typeof memberTypes)[number];
    const tr = Math.random();
    if (tr < 0.4) memberType = 'anonymous';
    else if (tr < 0.65) memberType = 'email';
    else if (tr < 0.8) memberType = 'spotify';
    else if (tr < 0.9) memberType = 'customer';
    else memberType = 'sms';

    const country = pickCountry();
    const city = pickCity(country);
    const firstSeen = hockeyStickDate(90);
    const lastSeen = new Date(
      firstSeen.getTime() + Math.random() * (Date.now() - firstSeen.getTime())
    );
    const visits = 1 + Math.floor(Math.random() * 50);

    // Bell curve engagement with 10% superfans
    let engagementScore: number;
    if (Math.random() < 0.1) {
      engagementScore = 80 + Math.floor(Math.random() * 20); // superfan
    } else {
      engagementScore = Math.floor(30 + Math.random() * 40); // bell curve center
    }

    // Intent levels: 20% high, 50% medium, 30% low
    let intentLevel: 'high' | 'medium' | 'low';
    const ir = Math.random();
    if (ir < 0.2) intentLevel = 'high';
    else if (ir < 0.7) intentLevel = 'medium';
    else intentLevel = 'low';

    const name =
      memberType !== 'anonymous' ? FAN_NAMES[i % FAN_NAMES.length] : null;
    const tags: string[] = [];
    if (engagementScore > 80) tags.push('superfan');
    if (memberType === 'customer') tags.push('customer', 'tipper');

    audienceRows.push({
      creatorProfileId: profileId,
      type: memberType,
      displayName: name,
      firstSeenAt: firstSeen,
      lastSeenAt: lastSeen,
      visits,
      engagementScore,
      intentLevel,
      geoCity: city,
      geoCountry: country,
      deviceType: deviceTypes[Math.floor(Math.random() * deviceTypes.length)],
      referrerHistory: (() => {
        const referrerSources = [
          'https://instagram.com',
          'https://tiktok.com',
          'https://twitter.com',
          'https://youtube.com',
          'https://google.com',
          'https://facebook.com',
        ];
        const entryCount = Math.min(visits, 3 + Math.floor(Math.random() * 3));
        const spanMs = Math.max(lastSeen.getTime() - firstSeen.getTime(), 0);
        const offsets = Array.from(
          { length: entryCount },
          () => Math.random() * spanMs
        ).sort((a, b) => a - b);
        return offsets.map(offset => ({
          url: referrerSources[
            Math.floor(Math.random() * referrerSources.length)
          ],
          timestamp: new Date(firstSeen.getTime() + offset).toISOString(),
        }));
      })(),
      latestActions: [
        { action: 'profile_view', timestamp: lastSeen.toISOString() },
      ],
      email:
        memberType === 'email' || memberType === 'customer'
          ? `demo.aud.${i}@example.com`
          : null,
      phone:
        memberType === 'sms'
          ? `+1555${String(2000 + i).padStart(7, '0')}`
          : null,
      spotifyConnected: memberType === 'spotify',
      purchaseCount:
        memberType === 'customer' ? 1 + Math.floor(Math.random() * 5) : 0,
      tags,
      fingerprint: `fp_demo_${i}`,
    });
  }

  const created = await db
    .insert(audienceMembers)
    .values(audienceRows)
    .onConflictDoNothing()
    .returning({ id: audienceMembers.id });
  console.log(`    Created ${created.length} audience members`);
  return created.map(c => c.id);
}

async function seedDemoTips(profileId: string): Promise<
  {
    id: string;
    isAnonymous: boolean;
    email: string | null;
    name: string | null;
  }[]
> {
  console.log('  Seeding tips...');

  const amounts = [
    ...Array(8).fill(500),
    ...Array(7).fill(1000),
    ...Array(6).fill(2000),
    ...Array(4).fill(2500),
    ...Array(3).fill(5000),
    ...Array(2).fill(10000),
  ];

  const messages = [
    'Your set at the Fillmore was transcendent. Thank you.',
    'Midnight Drive has been the soundtrack to my summer.',
    "Been a fan since your first EP. So proud of how far you've come.",
    "My daughter's first concert was your show in Nashville. Thank you for that memory.",
    'Your music got me through a really tough year. This is a small thank you.',
    'Saw you open for Glass Animals and been hooked ever since.',
    'The production on your new single is insane. Keep pushing boundaries.',
    "You deserve way more recognition. Here's my small contribution.",
    'Listening to Fading Signals on repeat. Pure magic.',
    'Your music makes my morning commute bearable. Seriously.',
    "Just discovered you through a friend's playlist. Instant fan.",
    'The way you blend electronic and organic sounds is so unique.',
    "Bought tickets to your LA show. Can't wait!",
    'Your Instagram live sessions are the highlight of my week.',
    'Thank you for making music that actually means something.',
  ];

  const tipRows = [];
  const tipMeta: {
    isAnonymous: boolean;
    email: string | null;
    name: string | null;
  }[] = [];

  for (let i = 0; i < amounts.length; i++) {
    const isAnonymous = Math.random() < 0.3;
    const fanName = !isAnonymous ? FAN_NAMES[i % FAN_NAMES.length] : null;
    const email = !isAnonymous
      ? `demo.tip.${i}.${fanEmail(fanName ?? 'anon')}`
      : null;
    const createdAt = hockeyStickDate(90);

    // Currency: 90% USD, 5% EUR, 5% GBP
    let currency: 'USD' | 'EUR' | 'GBP';
    const cr = Math.random();
    if (cr < 0.9) currency = 'USD';
    else if (cr < 0.95) currency = 'EUR';
    else currency = 'GBP';

    tipRows.push({
      creatorProfileId: profileId,
      amountCents: amounts[i],
      currency,
      paymentIntentId: `pi_demo_${i}`,
      tipperName: fanName,
      contactEmail: email,
      message: !isAnonymous ? messages[i % messages.length] : null,
      isAnonymous,
      status: 'completed' as const,
      createdAt,
    });

    tipMeta.push({ isAnonymous, email, name: fanName });
  }

  const created = await db
    .insert(tips)
    .values(tipRows)
    .returning({ id: tips.id });
  console.log(`    Created ${created.length} tips`);

  return created.map((c, i) => ({ id: c.id, ...tipMeta[i] }));
}

async function seedDemoTipAudience(
  profileId: string,
  tipData: {
    id: string;
    isAnonymous: boolean;
    email: string | null;
    name: string | null;
  }[]
) {
  console.log('  Seeding tip audience...');

  const rows = [];
  for (const tip of tipData) {
    if (tip.isAnonymous || !tip.email) continue;
    rows.push({
      profileId,
      email: tip.email,
      name: tip.name,
      source: 'tip' as const,
      tipAmountTotalCents: 1000,
      tipCount: 1,
    });
  }

  if (rows.length > 0) {
    await db.insert(tipAudience).values(rows).onConflictDoNothing();
  }
  console.log(`    Created ${rows.length} tip audience entries`);
}

async function seedDemoClicks(profileId: string, linkIds: string[]) {
  console.log('  Seeding click events...');

  const browsers = ['Chrome', 'Safari', 'Firefox', 'Edge'];
  const oses = ['iOS', 'Android', 'Windows', 'macOS', 'Linux'];
  const linkTypes = ['listen', 'social', 'tip', 'other'] as const;

  const clickRows = [];

  for (let i = 0; i < 800; i++) {
    const clickDate = hockeyStickDate(90);
    const dayOfWeek = clickDate.getUTCDay();
    // Weekday-weighted: skip ~33% of weekend clicks
    if ((dayOfWeek === 0 || dayOfWeek === 6) && Math.random() < 0.33) continue;

    const country = pickCountry();
    const city = pickCity(country);

    // Link type distribution: 60% listen, 20% social, 15% tip, 5% other
    let linkType: (typeof linkTypes)[number];
    const lr = Math.random();
    if (lr < 0.6) linkType = 'listen';
    else if (lr < 0.8) linkType = 'social';
    else if (lr < 0.95) linkType = 'tip';
    else linkType = 'other';

    // Referrer distribution
    let referrer: string | null;
    const rr = Math.random();
    if (rr < 0.3) referrer = 'https://instagram.com';
    else if (rr < 0.45) referrer = 'https://twitter.com';
    else if (rr < 0.65) referrer = 'https://google.com';
    else if (rr < 0.8) referrer = 'https://tiktok.com';
    else referrer = null; // direct

    // Device distribution: 55% mobile, 35% desktop, 10% tablet
    let deviceType: string;
    const dr = Math.random();
    if (dr < 0.55) deviceType = 'mobile';
    else if (dr < 0.9) deviceType = 'desktop';
    else deviceType = 'tablet';

    clickRows.push({
      creatorProfileId: profileId,
      linkId:
        linkIds.length > 0
          ? linkIds[Math.floor(Math.random() * linkIds.length)]
          : null,
      linkType,
      ipAddress: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      userAgent: `Mozilla/5.0 (${oses[Math.floor(Math.random() * oses.length)]}) ${browsers[Math.floor(Math.random() * browsers.length)]}`,
      referrer,
      country,
      city,
      deviceType,
      os: oses[Math.floor(Math.random() * oses.length)],
      browser: browsers[Math.floor(Math.random() * browsers.length)],
      isBot: Math.random() < 0.02,
      createdAt: clickDate,
    });
  }

  if (clickRows.length > 0) {
    await db.insert(clickEvents).values(clickRows);
  }
  console.log(`    Created ${clickRows.length} click events`);
}

async function seedDemoProfileViews(profileId: string) {
  console.log('  Seeding daily profile views...');

  const rows = [];
  const now = new Date();

  // 3 random spike days
  const spikeDays = new Set<number>();
  while (spikeDays.size < 3) {
    spikeDays.add(Math.floor(Math.random() * 90));
  }

  for (let daysAgo = 0; daysAgo < 90; daysAgo++) {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    const dayOfWeek = date.getUTCDay();

    // Hockey-stick: start ~15-25, grow to ~80-120
    const progress = (90 - daysAgo) / 90; // 0 = oldest, 1 = today
    const baseViews = 15 + Math.floor(progress ** 2 * 100);
    let viewCount = baseViews + Math.floor(Math.random() * 15);

    // Weekend dip
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      viewCount = Math.floor(viewCount * 0.7);
    }

    // Spike days: 3x
    if (spikeDays.has(daysAgo)) {
      viewCount = viewCount * 3;
    }

    const viewDate = date.toISOString().split('T')[0];
    rows.push({
      creatorProfileId: profileId,
      viewDate,
      viewCount,
    });
  }

  if (rows.length > 0) {
    await db.insert(dailyProfileViews).values(rows).onConflictDoNothing();
  }
  console.log(`    Created ${rows.length} daily profile view records`);
}

async function seedDemoInbox(profileId: string, contactIds: string[]) {
  console.log('  Seeding inbox threads...');

  const bookingContactId = contactIds[0]; // Mike Chen - bookings

  const threads = [
    {
      subject: 'Outside Lands 2026 — Artist Booking Inquiry',
      category: 'booking' as const,
      priority: 'high' as const,
      status: 'pending_review' as const,
      categoryConfidence: 0.96,
      aiSummary:
        'Festival booking inquiry from Outside Lands for August 2026. $15,000 guarantee offered for a 45-minute set on the Sutro stage.',
      aiExtractedData: {
        senderOrganization: 'Another Planet Entertainment',
        senderRole: 'Talent Buyer',
        proposedDates: ['2026-08-07', '2026-08-08', '2026-08-09'],
        budgetMentioned: '$15,000',
        venueOrLocation: 'Outside Lands - Sutro Stage',
      },
      email: {
        fromEmail: 'alex.rivera@outsidelands.example.com',
        fromName: 'Alex Rivera',
        bodyText:
          "Hi Calvin,\n\nHope this message finds you well. I'm Alex Rivera, Talent Buyer at Another Planet Entertainment. We're putting together the 2026 Outside Lands lineup and we'd love to have you on the Sutro stage.\n\nWe're looking at August 7-9 and can offer a $15,000 guarantee for a 45-minute set. The festival typically draws 75,000+ attendees daily and your sound would be a perfect fit for the Sutro crowd.\n\nWould love to discuss details with your team. Are you available for a quick call this week?\n\nBest,\nAlex Rivera\nTalent Buyer, Another Planet Entertainment",
      },
    },
    {
      subject: 'Pitchfork Feature — Interview Request',
      category: 'press' as const,
      priority: 'medium' as const,
      status: 'pending_review' as const,
      categoryConfidence: 0.94,
      aiSummary:
        'Pitchfork writer requesting an interview for a feature piece about emerging artists blending electronic and organic sounds.',
      aiExtractedData: {
        senderOrganization: 'Pitchfork',
        senderRole: 'Staff Writer',
        requestType: 'Interview',
      },
      email: {
        fromEmail: 'jessica.nguyen@pitchfork.example.com',
        fromName: 'Jessica Nguyen',
        bodyText:
          "Hi Calvin,\n\nI'm Jessica Nguyen, a staff writer at Pitchfork. I'm working on a feature about artists who are redefining the boundary between electronic and acoustic music, and your work keeps coming up in my research.\n\nWould you be open to a 30-minute interview? I'd love to talk about your creative process, particularly how you revisit catalog moments on releases like \"I'm Not Alone Remixes.\"\n\nWe're looking to publish in the April issue. Happy to work around your schedule.\n\nThanks,\nJessica",
      },
    },
    {
      subject: 'Sennheiser x Calvin Harris — Creator Partnership',
      category: 'brand_partnership' as const,
      priority: 'high' as const,
      status: 'pending_review' as const,
      categoryConfidence: 0.93,
      aiSummary:
        'Sennheiser proposing a creator partnership for their Momentum headphone line. Includes product endorsement and content creation.',
      aiExtractedData: {
        senderOrganization: 'Sennheiser',
        senderRole: 'Partnerships Lead',
        budgetMentioned: 'TBD - negotiable',
      },
      email: {
        fromEmail: 'partnerships@sennheiser.example.com',
        fromName: 'David Park',
        bodyText:
          "Hi Calvin,\n\nDavid Park here from Sennheiser's Creator Partnerships team. We've been following your work and think there's a natural fit between your artistry and the Momentum line.\n\nWe're exploring a creator partnership that would include:\n- Product endorsement (Momentum 4 Wireless)\n- 3 social content pieces over 6 months\n- Studio session content featuring the gear\n- Affiliate compensation on sales through your link\n\nWould love to set up a call to discuss terms and creative direction. Are you interested?\n\nBest,\nDavid Park\nCreator Partnerships, Sennheiser",
      },
    },
    {
      subject: 'Your music changed my life',
      category: 'fan_mail' as const,
      priority: 'low' as const,
      status: 'pending_review' as const,
      categoryConfidence: 0.97,
      aiSummary:
        "Heartfelt fan letter about how the artist's music helped during a difficult personal period.",
      aiExtractedData: { requestType: 'Fan appreciation' },
      email: {
        fromEmail: 'sarah.m@gmail.com',
        fromName: 'Sarah M.',
        bodyText:
          'Dear Calvin,\n\nI know you probably get a lot of messages like this, but I had to write. Your album 96 Months came into my life at exactly the right time. I was going through a divorce and your music was the only thing that made the long nights bearable.\n\n"Miracle" in particular — that drop where everything opens up — it just hits different when you\'re starting over. I\'ve listened to it probably 500 times.\n\nI just wanted to say thank you. Your art matters more than you know.\n\nWith gratitude,\nSarah',
      },
    },
    {
      subject: 'Collab? I have a beat that would be perfect for you',
      category: 'music_collaboration' as const,
      priority: 'medium' as const,
      status: 'pending_review' as const,
      categoryConfidence: 0.92,
      aiSummary:
        "Producer pitching a collaboration, shares demo link and describes their style as complementary to the artist's sound.",
      aiExtractedData: {
        senderOrganization: 'Independent',
        senderRole: 'Producer',
      },
      email: {
        fromEmail: 'beats@producerx.example.com',
        fromName: 'DJ Lumina',
        bodyText:
          "Hey Calvin!\n\nBig fan of your work, especially the production on Desire with Sam Smith. I'm DJ Lumina — I produce electronic/ambient stuff and I think our styles would mesh really well.\n\nI've got a beat that I've been sitting on that has your name written all over it. It's got this ethereal synth pad foundation with a driving rhythm section that I think you'd vibe with.\n\nHere's a demo: https://soundcloud.com/djlumina/collab-demo-private\n\nWould love to hear your thoughts. No pressure at all.\n\nPeace,\nLumina",
      },
    },
    {
      subject: 'Headlining opportunity — The Fillmore, October 2026',
      category: 'booking' as const,
      priority: 'high' as const,
      status: 'routed' as const,
      routedToContactId: bookingContactId,
      categoryConfidence: 0.98,
      aiSummary:
        'The Fillmore offering a headlining slot in October 2026. Routed to booking agent Mike Chen.',
      aiExtractedData: {
        senderOrganization: 'The Fillmore',
        senderRole: 'Events Director',
        proposedDates: ['2026-10-15'],
        venueOrLocation: 'The Fillmore, San Francisco',
      },
      email: {
        fromEmail: 'events@thefillmore.example.com',
        fromName: 'The Fillmore Events',
        bodyText:
          "Hi Calvin,\n\nWe'd love to offer you a headlining slot at The Fillmore in October 2026. Based on your growing Bay Area following and the success of your last run here, we think a proper headline would be electric.\n\nWe're looking at October 15th. The Fillmore capacity is 1,150 and we're confident we can sell it out based on your trajectory.\n\nPlease have your booking team reach out to discuss terms.\n\nBest,\nThe Fillmore Events Team",
      },
    },
    {
      subject: 'Get 1M Spotify streams GUARANTEED!!!',
      category: 'spam' as const,
      priority: 'low' as const,
      status: 'archived' as const,
      categoryConfidence: 0.99,
      aiSummary: 'Spam: Fake streaming promotion service.',
      aiExtractedData: {},
      email: {
        fromEmail: 'promo@guaranteed-streams.example.com',
        fromName: null,
        bodyText:
          'GUARANTEED SPOTIFY STREAMS! Get 1 MILLION real streams for just $299! Our network of premium playlists will get your music heard. Act now and get 50% off! Click here: https://guaranteed-streams.example.com/buy',
      },
    },
    {
      subject: 'Management representation interest',
      category: 'management' as const,
      priority: 'medium' as const,
      status: 'pending_review' as const,
      categoryConfidence: 0.95,
      aiSummary:
        'Red Light Management expressing interest in representing the artist. Mentions their roster includes similar electronic/indie acts.',
      aiExtractedData: {
        senderOrganization: 'Red Light Management',
        senderRole: 'Talent Manager',
      },
      email: {
        fromEmail: 'talent@redlightmgmt.example.com',
        fromName: 'Chris Walsh',
        bodyText:
          'Hi Calvin,\n\nChris Walsh here from Red Light Management. I\'ve been watching your career with great interest — particularly the organic audience growth and the quality of your fanbase engagement.\n\nRed Light represents artists across electronic, indie, and pop, and I think we could be a great fit for where you\'re headed. We specialize in artist development at your stage — bridging the gap between "emerging" and "established."\n\nWould love to grab a coffee or hop on a call to introduce ourselves properly. No commitment, just a conversation.\n\nBest,\nChris Walsh\nRed Light Management',
      },
    },
  ];

  for (const thread of threads) {
    // Create thread
    const threadDate = hockeyStickDate(30);
    const [createdThread] = await db
      .insert(emailThreads)
      .values({
        creatorProfileId: profileId,
        subject: thread.subject,
        category: thread.category,
        priority: thread.priority,
        status: thread.status,
        categoryConfidence: thread.categoryConfidence,
        aiSummary: thread.aiSummary,
        aiExtractedData: thread.aiExtractedData,
        routedToContactId:
          'routedToContactId' in thread
            ? (thread as { routedToContactId: string }).routedToContactId
            : null,
        routedAt: thread.status === 'routed' ? threadDate : null,
        latestMessageAt: threadDate,
        messageCount: 1,
        isRead: thread.status === 'archived',
        createdAt: threadDate,
      })
      .returning({ id: emailThreads.id });

    // Create inbound email
    await db.insert(inboundEmails).values({
      creatorProfileId: profileId,
      threadId: createdThread.id,
      fromEmail: thread.email.fromEmail,
      fromName: thread.email.fromName,
      toEmail: `tim@jovie.fm`,
      subject: thread.subject,
      bodyText: thread.email.bodyText,
      receivedAt: threadDate,
      createdAt: threadDate,
    });
  }

  console.log(`    Created ${threads.length} email threads with messages`);
}

async function seedDemoInsights(profileId: string) {
  console.log('  Seeding AI insights...');

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 30);
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  // Create generation run
  const [run] = await db
    .insert(insightGenerationRuns)
    .values({
      creatorProfileId: profileId,
      status: 'completed',
      insightsGenerated: 6,
      dataPointsAnalyzed: 1200,
      modelUsed: 'gpt-4o',
      promptTokens: 3200,
      completionTokens: 1800,
      durationMs: 4500,
    })
    .returning({ id: insightGenerationRuns.id });

  const insights = [
    {
      insightType: 'city_growth' as const,
      category: 'geographic' as const,
      priority: 'high' as const,
      title: 'Los Angeles listeners grew 34% this month',
      description:
        'Your LA audience is surging. Profile views from Los Angeles increased 34% compared to last month, driven primarily by Instagram referrals.',
      actionSuggestion:
        'Consider adding an LA show to your tour calendar — the demand is clearly there.',
      confidence: '0.92',
      dataSnapshot: {
        city: 'Los Angeles',
        growthRate: 0.34,
        previousViews: 120,
        currentViews: 161,
      },
    },
    {
      insightType: 'subscriber_surge' as const,
      category: 'growth' as const,
      priority: 'medium' as const,
      title:
        'Newsletter signups spiked 3x after your Instagram story on March 12',
      description:
        'Your Instagram story about the upcoming single drove a 3x spike in email subscriptions. Stories with behind-the-scenes content consistently outperform promotional posts.',
      actionSuggestion:
        'Post more behind-the-scenes content on Instagram Stories before releases.',
      confidence: '0.88',
      dataSnapshot: { spikeDate: '2026-03-12', normalRate: 4, spikeRate: 12 },
    },
    {
      insightType: 'tour_gap' as const,
      category: 'tour' as const,
      priority: 'high' as const,
      title:
        'No shows scheduled in the Pacific Northwest — your 3rd largest market',
      description:
        'Seattle and Portland combined represent 12% of your audience, but you have no upcoming shows in the region. Your Crystal Ballroom date is sold out — the demand is there.',
      actionSuggestion:
        'Book a Seattle venue (Showbox or Neptune) in the next 3-6 months.',
      confidence: '0.90',
      dataSnapshot: {
        market: 'Pacific Northwest',
        audienceShare: 0.12,
        currentShows: 0,
      },
    },
    {
      insightType: 'platform_preference' as const,
      category: 'platform' as const,
      priority: 'medium' as const,
      title:
        '67% of your link clicks come from Spotify — consider promoting Apple Music and YouTube',
      description:
        'Spotify dominates your link clicks at 67%, while Apple Music (12%) and YouTube (8%) are underrepresented. Diversifying platform promotion could expand your reach.',
      actionSuggestion:
        'Add Apple Music and YouTube links more prominently in your social bios.',
      confidence: '0.85',
      dataSnapshot: {
        spotify: 0.67,
        appleMusic: 0.12,
        youtube: 0.08,
        other: 0.13,
      },
    },
    {
      insightType: 'tip_hotspot' as const,
      category: 'revenue' as const,
      priority: 'medium' as const,
      title:
        'Fans in Nashville tip 2.3x the average — consider a meet & greet there',
      description:
        'Nashville fans are your most generous tippers, averaging $18.50 per tip vs. $8.00 overall. A meet & greet at your Ryman show could significantly boost tip revenue.',
      actionSuggestion:
        'Add a VIP meet & greet option for your Nashville show.',
      confidence: '0.87',
      dataSnapshot: {
        city: 'Nashville',
        avgTip: 1850,
        overallAvg: 800,
        ratio: 2.3,
      },
    },
    {
      insightType: 'release_momentum' as const,
      category: 'content' as const,
      priority: 'low' as const,
      title:
        'Your latest single is gaining traction — 47 new subscribers in the week after release',
      description:
        'The release of "Raw Energy" drove 47 new email subscribers in the first week, 3.5x your weekly average. The momentum is real.',
      actionSuggestion:
        'Capitalize on this momentum with a follow-up content drop (remix, music video, live session).',
      confidence: '0.91',
      dataSnapshot: { release: 'Raw Energy', newSubs: 47, weeklyAvg: 13 },
    },
  ];

  const insightRows = insights.map(insight => ({
    creatorProfileId: profileId,
    insightType: insight.insightType,
    category: insight.category,
    priority: insight.priority,
    title: insight.title,
    description: insight.description,
    actionSuggestion: insight.actionSuggestion,
    confidence: insight.confidence,
    dataSnapshot: insight.dataSnapshot,
    periodStart,
    periodEnd: now,
    status: 'active' as const,
    expiresAt,
    generationRunId: run.id,
  }));

  await db.insert(aiInsights).values(insightRows).onConflictDoNothing();
  console.log(`    Created ${insightRows.length} AI insights`);
}

async function seedDemoChatHistory(userId: string, profileId: string) {
  console.log('  Seeding chat history...');

  const conversations = [
    {
      title: 'Help me update my bio',
      messages: [
        {
          role: 'user' as const,
          content:
            'Can you help me update my bio? I want something that captures my sound and vibe without being too long.',
        },
        {
          role: 'assistant' as const,
          content:
            'Here\'s a polished bio for you:\n\n"Producer, songwriter, and artist building at the intersection of music and technology. Creating sounds that blur the line between organic and electronic — from intimate bedroom productions to festival stages.\n\nLatest release: Raw Energy"\n\nThis is concise (under 280 chars for social sharing), hits your key identity points, and includes a call-to-action with your latest release. Want me to update your profile with this?',
        },
      ],
    },
    {
      title: 'What are my top cities for listeners?',
      messages: [
        {
          role: 'user' as const,
          content:
            'What are my top cities for listeners? I want to know where to focus my next tour dates.',
        },
        {
          role: 'assistant' as const,
          content:
            "Based on your profile views and click data over the last 90 days, here are your top cities:\n\n1. **Los Angeles** — 22% of traffic (growing 34% month-over-month)\n2. **New York** — 18% of traffic\n3. **San Francisco** — 14% of traffic (your home market)\n4. **London** — 9% of traffic\n5. **Nashville** — 7% of traffic (also your highest-tipping city)\n\nNotably, **Seattle and Portland** combined make up 12% but you have no shows there. That's a gap worth filling. Your Columbiahalle show in Berlin sold out, so European demand is real too.\n\nWant me to draft a tour routing suggestion based on this data?",
        },
      ],
    },
    {
      title: 'Draft a message to my subscribers about my new single',
      messages: [
        {
          role: 'user' as const,
          content:
            'Draft a notification for my subscribers about my new single "Raw Energy" that just dropped today.',
        },
        {
          role: 'assistant' as const,
          content:
            "Here's a notification draft:\n\n**Subject:** \"Raw Energy\" is out now\n\n**Body:**\nHey! My new single \"Raw Energy\" is live everywhere. This one's been in the works for months and I'm really proud of how it turned out — it's probably the most energetic thing I've ever made.\n\nListen now: [link]\n\nIf you dig it, adding it to a playlist or sharing it with a friend means the world. Every stream and share helps more than you know.\n\nThanks for being here.\n— Tim\n\nThis keeps it personal, authentic, and has a clear call-to-action without feeling like marketing. Want me to send this to your subscribers?",
        },
      ],
    },
  ];

  for (const conv of conversations) {
    const convDate = hockeyStickDate(14);
    const [created] = await db
      .insert(chatConversations)
      .values({
        userId,
        creatorProfileId: profileId,
        title: conv.title,
        createdAt: convDate,
        updatedAt: convDate,
      })
      .returning({ id: chatConversations.id });

    for (let i = 0; i < conv.messages.length; i++) {
      const msgDate = new Date(convDate.getTime() + i * 5000); // 5s between messages
      await db.insert(chatMessages).values({
        conversationId: created.id,
        role: conv.messages[i].role,
        content: conv.messages[i].content,
        createdAt: msgDate,
      });
    }
  }

  console.log(`    Created ${conversations.length} chat conversations`);
}

async function seedDemoReferrals(userId: string) {
  console.log('  Seeding referrals...');

  // Create referral code
  const [code] = await db
    .insert(referralCodes)
    .values({
      userId,
      code: 'TIMWHITE',
      isActive: true,
    })
    .returning({ id: referralCodes.id });

  // Create 3 fake referred users, then referrals + commissions
  const referredUserIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [referredUser] = await db
      .insert(users)
      .values({
        clerkId: `demo_referred_${i}_${DEMO_USERNAME}`,
        email: DEMO_REFERRED_EMAILS[i],
        name: FAN_NAMES[i + 10],
        userStatus: 'active',
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          clerkId: `demo_referred_${i}_${DEMO_USERNAME}`,
          name: FAN_NAMES[i + 10],
          userStatus: 'active',
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });
    referredUserIds.push(referredUser.id);
  }

  const referralIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const subscribedAt = hockeyStickDate(60);
    const [ref] = await db
      .insert(referrals)
      .values({
        referrerUserId: userId,
        referredUserId: referredUserIds[i],
        referralCodeId: code.id,
        status: 'active',
        commissionRateBps: 5000,
        commissionDurationMonths: 24,
        subscribedAt,
      })
      .returning({ id: referrals.id });
    referralIds.push(ref.id);
  }

  // Create commissions totaling ~$127
  const commissions = [
    {
      referralIdx: 0,
      amountCents: 2500,
      status: 'paid' as const,
      invoiceNum: 1,
    },
    {
      referralIdx: 0,
      amountCents: 2500,
      status: 'paid' as const,
      invoiceNum: 2,
    },
    {
      referralIdx: 1,
      amountCents: 3200,
      status: 'approved' as const,
      invoiceNum: 3,
    },
    {
      referralIdx: 2,
      amountCents: 2500,
      status: 'approved' as const,
      invoiceNum: 4,
    },
    {
      referralIdx: 2,
      amountCents: 2000,
      status: 'approved' as const,
      invoiceNum: 5,
    },
  ];

  for (const c of commissions) {
    await db.insert(referralCommissions).values({
      referralId: referralIds[c.referralIdx],
      referrerUserId: userId,
      stripeInvoiceId: `in_demo_${c.invoiceNum}`,
      amountCents: c.amountCents,
      currency: 'usd',
      status: c.status,
      paidAt: c.status === 'paid' ? hockeyStickDate(30) : null,
    });
  }

  console.log('    Created 1 referral code, 3 referrals, 5 commissions ($127)');
}

async function seedDemoEmailEngagement(
  profileId: string,
  subscriberIds: string[],
  releaseIds: string[]
) {
  console.log('  Seeding email engagement...');

  // Seed fan release notifications
  const notifRows = [];
  for (let i = 0; i < Math.min(3, releaseIds.length); i++) {
    if (subscriberIds.length === 0) break;
    const subId = subscriberIds[i % subscriberIds.length];
    notifRows.push({
      creatorProfileId: profileId,
      releaseId: releaseIds[i],
      notificationSubscriptionId: subId,
      notificationType: 'release_day' as const,
      scheduledFor: hockeyStickDate(14),
      status: 'sent' as const,
      sentAt: hockeyStickDate(14),
      dedupKey: `demo_release_notif_${i}`,
    });
  }

  let notifIds: string[] = [];
  if (notifRows.length > 0) {
    const created = await db
      .insert(fanReleaseNotifications)
      .values(notifRows)
      .onConflictDoNothing()
      .returning({ id: fanReleaseNotifications.id });
    notifIds = created.map(c => c.id);
  }

  // Seed email engagement events (~60 rows)
  const engagementRows = [];
  for (let i = 0; i < 60; i++) {
    const isClick = Math.random() < 0.12;
    const refId =
      notifIds.length > 0
        ? notifIds[i % notifIds.length]
        : subscriberIds[i % subscriberIds.length];

    engagementRows.push({
      emailType: 'release_notification' as const,
      eventType: (isClick ? 'click' : 'open') as 'click' | 'open',
      referenceId: refId,
      recipientHash: `sha256_demo_${i}`,
      metadata: {
        deviceType:
          Math.random() < 0.6 ? ('mobile' as const) : ('desktop' as const),
        country: pickCountry(),
      },
      createdAt: hockeyStickDate(14),
    });
  }

  if (engagementRows.length > 0) {
    await db.insert(emailEngagement).values(engagementRows);
  }

  console.log(
    `    Created ${notifRows.length} notifications, ${engagementRows.length} engagement events`
  );
}

async function seedDemoPreSaveTokens(profileId: string, releaseIds: string[]) {
  console.log('  Seeding pre-save tokens...');

  if (releaseIds.length === 0) {
    console.log('    No releases to create pre-saves for');
    return;
  }

  const releaseId = releaseIds[releaseIds.length - 1]; // most recent release
  const rows = [];

  for (let i = 0; i < 50; i++) {
    const isSpotify = Math.random() < 0.6;
    const executed = Math.random() < 0.7;
    const createdAt = hockeyStickDate(30);

    rows.push({
      releaseId,
      provider: isSpotify ? 'spotify' : 'apple_music',
      spotifyAccountId: isSpotify ? `spotify_demo_${i}` : null,
      fanEmail: `demo.presave.${i}@example.com`,
      executedAt: executed ? new Date(createdAt.getTime() + 86400000) : null, // executed 1 day after creation
      createdAt,
    });
  }

  if (rows.length > 0) {
    await db.insert(preSaveTokens).values(rows).onConflictDoNothing();
  }
  console.log(`    Created ${rows.length} pre-save tokens`);
}

async function seedDemoDspMatches(profileId: string) {
  console.log('  Seeding DSP matches...');

  const matches = [
    {
      providerId: 'spotify',
      externalArtistId: DEMO_PROFILE.spotifyArtistId ?? 'calvin-harris',
      externalArtistName: DEMO_DISPLAY_NAME,
      externalArtistUrl: DEMO_PROFILE.spotifyUrl ?? 'https://open.spotify.com',
      confidenceScore: '0.9800',
      status: 'confirmed' as const,
      confirmedAt: new Date(),
    },
    {
      providerId: 'apple_music',
      externalArtistId: 'calvin-harris-apple',
      externalArtistName: DEMO_DISPLAY_NAME,
      externalArtistUrl:
        DEMO_PROFILE.appleMusicUrl ??
        'https://music.apple.com/us/search?term=Calvin%20Harris',
      confidenceScore: '0.9500',
      status: 'confirmed' as const,
      confirmedAt: new Date(),
    },
    {
      providerId: 'youtube_music',
      externalArtistId: 'UCcalvinharrisofficial',
      externalArtistName: DEMO_DISPLAY_NAME,
      externalArtistUrl: 'https://music.youtube.com/search?q=Calvin+Harris',
      confidenceScore: '0.9200',
      status: 'confirmed' as const,
      confirmedAt: new Date(),
    },
    {
      providerId: 'deezer',
      externalArtistId: 'calvin-harris-deezer',
      externalArtistName: DEMO_DISPLAY_NAME,
      externalArtistUrl: 'https://www.deezer.com/search/Calvin%20Harris',
      confidenceScore: '0.8800',
      status: 'confirmed' as const,
      confirmedAt: new Date(),
    },
    {
      providerId: 'tidal',
      externalArtistId: 'calvin-harris-tidal',
      externalArtistName: DEMO_DISPLAY_NAME,
      externalArtistUrl: 'https://listen.tidal.com/search?q=Calvin%20Harris',
      confidenceScore: '0.8200',
      status: 'suggested' as const,
      confirmedAt: null,
    },
  ];

  for (const match of matches) {
    await db
      .insert(dspArtistMatches)
      .values({
        creatorProfileId: profileId,
        providerId: match.providerId,
        externalArtistId: match.externalArtistId,
        externalArtistName: match.externalArtistName,
        externalArtistUrl: match.externalArtistUrl,
        confidenceScore: match.confidenceScore,
        status: match.status,
        confirmedAt: match.confirmedAt,
      })
      .onConflictDoNothing();
  }

  console.log(`    Created ${matches.length} DSP matches`);
}

// ---------------------------------------------------------------------------
// Redis cache invalidation
// ---------------------------------------------------------------------------

async function invalidateCache() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.log('  Redis credentials not set, skipping cache invalidation');
    return;
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const cacheKey = `profile:data:${DEMO_USERNAME}`;
    const deletedCount = await redis.del(cacheKey);
    console.log(`  Invalidated Redis cache (deleted ${deletedCount} key(s))`);
  } catch (error) {
    console.warn('  Failed to invalidate Redis cache:', error);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedDemoAccount() {
  console.log('Seeding demo account...\n');

  try {
    // 1. User
    const userId = await seedDemoUser();

    // 2. Profile
    const profileId = await seedDemoProfile(userId);

    // 3. Clean slate
    await cleanDemoChildData(profileId, userId);

    // 4. Contacts
    const contactIds = await seedDemoContacts(profileId);

    // 5. Releases
    const releaseIds = await seedDemoReleases(profileId);

    // 6. Release tasks
    await seedDemoReleaseTasks(profileId, releaseIds);

    // 7. Social links
    const linkIds = await seedDemoSocialLinks(profileId);

    // 8. Tour dates
    await seedDemoTourDates(profileId);

    // 9. Subscribers
    const subscriberIds = await seedDemoSubscribers(profileId);

    // 10. Audience
    await seedDemoAudience(profileId);

    // 11. Tips
    const tipData = await seedDemoTips(profileId);

    // 12. Tip audience
    await seedDemoTipAudience(profileId, tipData);

    // 13. Clicks
    await seedDemoClicks(profileId, linkIds);

    // 14. Profile views
    await seedDemoProfileViews(profileId);

    // 15. Inbox
    await seedDemoInbox(profileId, contactIds);

    // 16. Insights
    await seedDemoInsights(profileId);

    // 17. Chat history
    await seedDemoChatHistory(userId, profileId);

    // 18. Referrals
    await seedDemoReferrals(userId);

    // 19. Email engagement
    await seedDemoEmailEngagement(profileId, subscriberIds, releaseIds);

    // 20. Pre-save tokens
    await seedDemoPreSaveTokens(profileId, releaseIds);

    // 21. DSP matches
    await seedDemoDspMatches(profileId);

    // 22. Invalidate cache
    await invalidateCache();

    console.log('\nDemo account seeded successfully!');
    console.log(`  User: ${DEMO_DISPLAY_NAME} (${DEMO_EMAIL})`);
    console.log(`  Profile: @${DEMO_USERNAME}`);
    console.log(`  Releases: ${releaseIds.length}`);
    console.log(`  Subscribers: ${subscriberIds.length}`);
    console.log(`  Tips: ${tipData.length}`);
    console.log(`  Links: ${linkIds.length}`);
    console.log(`  Contacts: ${contactIds.length}`);
  } catch (error) {
    console.error('Failed to seed demo account:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDemoAccount()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedDemoAccount };
