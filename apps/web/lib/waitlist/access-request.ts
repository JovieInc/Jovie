import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureCriticalError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { notifySlackWaitlist } from '@/lib/notifications/providers/slack';
import { logger } from '@/lib/utils/logger';
import {
  detectPlatformFromUrl,
  extractHandleFromUrl,
} from '@/lib/utils/social-platform';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
} from '@/lib/waitlist/approval';
import { tryReserveAutoAcceptSlot } from '@/lib/waitlist/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubmitAccessRequestInput = {
  clerkUserId: string;
  email: string;
  emailRaw: string;
  fullName: string;
  data: {
    primaryGoal?: string | null;
    primarySocialUrl: string;
    spotifyUrl?: string | null;
    spotifyArtistName?: string | null;
    heardAbout?: string | null;
    selectedPlan?: string | null;
  };
};

export type SubmitAccessRequestResult = {
  outcome: string | undefined;
  status: string;
  entryId: string | undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize Spotify URL (minimal normalization)
 */
function normalizeSpotifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    const paramsToRemove = [
      'si',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'nd',
    ];
    paramsToRemove.forEach(param => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Generate a safe random handle for creator profiles
 */
function safeRandomHandle(): string {
  const token = randomUUID().replaceAll('-', '').slice(0, 12);
  return `c${token}`;
}

/**
 * Find an available username by trying base handle with numeric suffixes
 */
async function findAvailableHandle(base: string): Promise<string> {
  const normalizedBase = normalizeUsername(base).slice(0, 30);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i += 1) {
    const suffix = i === 0 ? '' : `-${i}`;
    const candidate = `${normalizedBase.slice(0, 30 - suffix.length)}${suffix}`;
    if (!validateUsername(candidate).isValid) continue;

    const [existing] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return safeRandomHandle();
}

// ---------------------------------------------------------------------------
// Upsert / Entry helpers
// ---------------------------------------------------------------------------

function buildWaitlistUpdateValues(params: {
  fullName: string;
  primaryGoal: string | null | undefined;
  primarySocialUrl: string;
  platform: string;
  normalizedUrl: string;
  spotifyUrl: string | null | undefined;
  spotifyUrlNormalized: string | null;
  spotifyArtistName: string | null;
  sanitizedHeardAbout: string | null;
  selectedPlan: string | null | undefined;
}) {
  return {
    fullName: params.fullName,
    primaryGoal: params.primaryGoal ?? null,
    primarySocialUrl: params.primarySocialUrl,
    primarySocialPlatform: params.platform,
    primarySocialUrlNormalized: params.normalizedUrl,
    spotifyUrl: params.spotifyUrl ?? null,
    spotifyUrlNormalized: params.spotifyUrlNormalized,
    spotifyArtistName: params.spotifyArtistName,
    heardAbout: params.sanitizedHeardAbout,
    selectedPlan: params.selectedPlan ?? null,
    updatedAt: new Date(),
  };
}

async function upsertUserAsPending(userId: string, emailRaw: string) {
  await db
    .insert(users)
    .values({
      clerkId: userId,
      email: emailRaw,
      userStatus: 'waitlist_pending',
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        userStatus: 'waitlist_pending',
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Existing / New entry handlers
// ---------------------------------------------------------------------------

async function handleExistingEntry(params: {
  existing: { id: string; status: string };
  clerkUserId: string;
  emailRaw: string;
  fullName: string;
  primaryGoal: string | null | undefined;
  primarySocialUrl: string;
  platform: string;
  normalizedUrl: string;
  spotifyUrl: string | null | undefined;
  spotifyUrlNormalized: string | null;
  spotifyArtistName: string | null;
  sanitizedHeardAbout: string | null;
  selectedPlan: string | null | undefined;
}): Promise<SubmitAccessRequestResult> {
  const { existing, clerkUserId, emailRaw, ...updateParams } = params;

  if (existing.status === 'new') {
    const updateValues = buildWaitlistUpdateValues(updateParams);
    await db
      .update(waitlistEntries)
      .set(updateValues)
      .where(eq(waitlistEntries.id, existing.id));
    await upsertUserAsPending(clerkUserId, emailRaw);
  }

  return { status: existing.status, outcome: undefined, entryId: existing.id };
}

async function createNewWaitlistEntry(params: {
  clerkUserId: string;
  emailRaw: string;
  email: string;
  fullName: string;
  primaryGoal: string | null | undefined;
  primarySocialUrl: string;
  platform: string;
  normalizedUrl: string;
  spotifyUrl: string | null | undefined;
  spotifyUrlNormalized: string | null;
  spotifyArtistName: string | null;
  sanitizedHeardAbout: string | null;
  selectedPlan: string | null | undefined;
}): Promise<{ entryId: string }> {
  const {
    clerkUserId,
    emailRaw,
    email,
    fullName,
    primaryGoal,
    primarySocialUrl,
    platform,
    normalizedUrl,
    spotifyUrl,
    spotifyUrlNormalized,
    spotifyArtistName,
    sanitizedHeardAbout,
    selectedPlan,
  } = params;

  const insertValues = {
    fullName,
    email,
    primaryGoal: primaryGoal ?? null,
    primarySocialUrl,
    primarySocialPlatform: platform,
    primarySocialUrlNormalized: normalizedUrl,
    spotifyUrl: spotifyUrl ?? null,
    spotifyUrlNormalized,
    spotifyArtistName,
    heardAbout: sanitizedHeardAbout,
    selectedPlan: selectedPlan ?? null,
    status: 'new' as const,
  };

  const [entry] = await db
    .insert(waitlistEntries)
    .values(insertValues)
    .returning({ id: waitlistEntries.id });

  if (!entry) {
    throw new Error('Failed to create waitlist entry');
  }

  const handleCandidate =
    extractHandleFromUrl(normalizedUrl) ??
    email.split('@')[0] ??
    safeRandomHandle();

  const baseHandle = validateUsername(handleCandidate).isValid
    ? handleCandidate
    : safeRandomHandle();

  const usernameNormalized = await findAvailableHandle(baseHandle);

  const trimmedName = fullName.trim();
  const displayName = trimmedName ? trimmedName.slice(0, 50) : 'Jovie creator';

  await db.insert(creatorProfiles).values({
    creatorType: 'creator',
    username: usernameNormalized,
    usernameNormalized,
    displayName,
    isPublic: false,
    isClaimed: false,
    waitlistEntryId: entry.id,
    settings: {},
    theme: {},
    ingestionStatus: 'idle',
  });

  await db
    .insert(users)
    .values({
      clerkId: clerkUserId,
      email: emailRaw,
      userStatus: 'waitlist_pending',
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        userStatus: 'waitlist_pending',
        updatedAt: new Date(),
      },
    });

  return { entryId: entry.id };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process a validated waitlist access request: detect platform, check for
 * existing entry, create or update, attempt auto-approval if slots are
 * available.
 */
export async function submitWaitlistAccessRequest(
  input: SubmitAccessRequestInput
): Promise<SubmitAccessRequestResult> {
  const { clerkUserId, email, emailRaw, fullName, data } = input;
  const {
    primaryGoal,
    primarySocialUrl,
    spotifyUrl,
    spotifyArtistName,
    heardAbout,
    selectedPlan,
  } = data;

  const sanitizedHeardAbout = heardAbout?.trim() || null;
  const sanitizedSpotifyArtistName = spotifyArtistName?.trim() || null;

  const { platform, normalizedUrl } = detectPlatformFromUrl(primarySocialUrl);

  const spotifyUrlNormalized = spotifyUrl
    ? normalizeSpotifyUrl(spotifyUrl)
    : null;

  // Check for existing entry
  const [existing] = await db
    .select({ id: waitlistEntries.id, status: waitlistEntries.status })
    .from(waitlistEntries)
    .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
    .limit(1);

  if (existing) {
    return handleExistingEntry({
      existing,
      clerkUserId,
      emailRaw,
      fullName,
      primaryGoal,
      primarySocialUrl,
      platform,
      normalizedUrl,
      spotifyUrl,
      spotifyUrlNormalized,
      spotifyArtistName: sanitizedSpotifyArtistName,
      sanitizedHeardAbout,
      selectedPlan,
    });
  }

  // Create new entry
  const { entryId } = await createNewWaitlistEntry({
    clerkUserId,
    emailRaw,
    email,
    fullName,
    primaryGoal,
    primarySocialUrl,
    platform,
    normalizedUrl,
    spotifyUrl,
    spotifyUrlNormalized,
    spotifyArtistName: sanitizedSpotifyArtistName,
    sanitizedHeardAbout,
    selectedPlan,
  });

  // Fire-and-forget Slack notification
  notifySlackWaitlist(fullName, email).catch(err => {
    logger.warn('[waitlist] Slack notification failed', err);
  });

  // Attempt auto-approval
  const { shouldAutoAccept } = await tryReserveAutoAcceptSlot();
  if (!shouldAutoAccept) {
    return { status: 'new', outcome: undefined, entryId };
  }

  const approvalResult = await withSystemIngestionSession(
    async tx => approveWaitlistEntryInTx(tx, entryId),
    { isolationLevel: 'serializable' }
  );

  if (
    approvalResult.outcome === 'no_profile' ||
    approvalResult.outcome === 'no_user'
  ) {
    captureCriticalError(
      `Auto-approval failed: ${approvalResult.outcome}`,
      new Error(
        `Unexpected outcome during auto-approval: ${approvalResult.outcome}`
      ),
      { entryId }
    );
    return { status: 'new', outcome: approvalResult.outcome, entryId };
  }

  if (approvalResult.outcome === 'approved') {
    await finalizeWaitlistApproval(approvalResult);
    return { status: 'claimed', outcome: 'approved', entryId };
  }

  return { status: 'new', outcome: approvalResult.outcome, entryId };
}
