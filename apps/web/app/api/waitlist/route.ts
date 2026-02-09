import { randomUUID } from 'node:crypto';
import { auth, currentUser } from '@clerk/nextjs/server';
import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, type TransactionType } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries, waitlistInvites } from '@/lib/db/schema/waitlist';
import { captureError, sanitizeErrorResponse } from '@/lib/error-tracking';
import { notifySlackWaitlist } from '@/lib/notifications/providers/slack';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { normalizeEmail } from '@/lib/utils/email';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import {
  detectPlatformFromUrl,
  extractHandleFromUrl,
} from '@/lib/utils/social-platform';
import { waitlistRequestSchema } from '@/lib/validation/schemas';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Module-level log to verify this file is loaded
logger.info('Waitlist Route Module loaded', {
  timestamp: new Date().toISOString(),
});

// Response builders for common responses
function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: 'Unauthorized' },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

function serviceUnavailableResponse(
  userMessage: string,
  debugMessage: string,
  code: string
) {
  return NextResponse.json(
    {
      success: false,
      ...sanitizeErrorResponse(userMessage, debugMessage, { code }),
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

function badRequestResponse(errorOrErrors: string | Record<string, unknown>) {
  const body =
    typeof errorOrErrors === 'string'
      ? { success: false, error: errorOrErrors }
      : { success: false, errors: errorOrErrors };
  return NextResponse.json(body, { status: 400, headers: NO_STORE_HEADERS });
}

function successResponse(data: Record<string, unknown>) {
  return NextResponse.json(
    { success: true, ...data },
    { headers: NO_STORE_HEADERS }
  );
}

// Database configuration check result
interface DbCheckResult {
  isConfigured: boolean;
  hasTable: boolean;
  errorResponse?: NextResponse;
  dbHost?: string;
}

async function checkDatabaseConfiguration(
  isDev: boolean
): Promise<DbCheckResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      isConfigured: false,
      hasTable: false,
      errorResponse: serviceUnavailableResponse(
        'Waitlist is temporarily unavailable.',
        'Set DATABASE_URL in .env.local and restart pnpm dev.',
        'db_not_configured'
      ),
    };
  }

  const dbHost = isDev ? extractDbHost(databaseUrl) : undefined;

  try {
    const result = await db.execute(
      drizzleSql<{ table_exists: boolean }>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'waitlist_entries'
        ) AS table_exists
      `
    );
    const hasTable = Boolean(result.rows?.[0]?.table_exists ?? false);
    return { isConfigured: true, hasTable, dbHost };
  } catch (error) {
    logger.error('Waitlist API DB connectivity error', error);
    const hostSuffix = dbHost ? ` (host: ${dbHost})` : '';
    const debugMsg =
      error instanceof Error
        ? `${error.message}${hostSuffix}`
        : `Database connection failed${hostSuffix}. Check Neon is reachable and credentials are valid.`;
    return {
      isConfigured: true,
      hasTable: false,
      errorResponse: serviceUnavailableResponse(
        'Waitlist is temporarily unavailable.',
        debugMsg,
        'db_unreachable'
      ),
    };
  }
}

function extractDbHost(databaseUrl: string): string | undefined {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.host;
  } catch {
    return undefined;
  }
}

function deriveFullName(params: {
  userFullName: string | null | undefined;
  userUsername: string | null | undefined;
  email: string;
}): string {
  const fromUser = (params.userFullName ?? '').trim();
  if (fromUser) return fromUser;

  const fromUsername = (params.userUsername ?? '').trim();
  if (fromUsername) return fromUsername;

  const localPart = params.email.split('@')[0]?.trim();
  if (localPart) return localPart;

  return 'Jovie user';
}

/**
 * Normalize Spotify URL (minimal normalization)
 */
function normalizeSpotifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Ensure https and clean up the URL
    parsed.protocol = 'https:';
    // Remove tracking params
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
 * Ported from approve/route.ts for profile auto-creation on signup
 */
async function findAvailableHandle(
  dbOrTx: TransactionType | typeof db,
  base: string
): Promise<string> {
  const normalizedBase = normalizeUsername(base).slice(0, 30);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i += 1) {
    const suffix = i === 0 ? '' : `-${i}`;
    const candidate = `${normalizedBase.slice(0, 30 - suffix.length)}${suffix}`;
    if (!validateUsername(candidate).isValid) continue;

    const [existing] = await dbOrTx
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

/**
 * Build update values for existing waitlist entry
 */
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

/**
 * Upsert user with waitlist_pending status
 */
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

/**
 * Handle existing waitlist entry update
 */
async function handleExistingEntry(params: {
  existing: { id: string; status: string };
  userId: string;
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
}): Promise<NextResponse> {
  const { existing, userId, emailRaw, ...updateParams } = params;

  // Avoid overwriting invited/claimed/rejected states.
  if (existing.status === 'new') {
    const updateValues = buildWaitlistUpdateValues(updateParams);
    await db
      .update(waitlistEntries)
      .set(updateValues)
      .where(eq(waitlistEntries.id, existing.id));
  }

  // Upsert users.userStatus to 'waitlist_pending' so auth gate recognizes submission
  await upsertUserAsPending(userId, emailRaw);

  return successResponse({ status: existing.status });
}

/**
 * Create new waitlist entry with profile
 */
async function createNewWaitlistEntry(params: {
  userId: string;
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
}): Promise<void> {
  const {
    userId,
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

  // 1. Insert waitlist entry
  const [entry] = await db
    .insert(waitlistEntries)
    .values(insertValues)
    .returning({ id: waitlistEntries.id });

  if (!entry) {
    throw new Error('Failed to create waitlist entry');
  }

  // 2. Auto-generate handle from social URL or email
  const handleCandidate =
    extractHandleFromUrl(normalizedUrl) ??
    email.split('@')[0] ??
    safeRandomHandle();

  const baseHandle = validateUsername(handleCandidate).isValid
    ? handleCandidate
    : safeRandomHandle();

  const usernameNormalized = await findAvailableHandle(db, baseHandle);

  // 3. Create unclaimed profile immediately (simplified signup flow)
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

  // 4. Upsert users.userStatus to 'waitlist_pending'
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

/**
 * Build error response for POST failures
 */
function buildPostErrorResponse(error: unknown, isDev: boolean): NextResponse {
  const errorMessage =
    isDev && error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';

  return NextResponse.json(
    {
      success: false,
      error: errorMessage,
      ...(isDev &&
        error instanceof Error && { stack: error.stack, details: error }),
    },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}

export async function GET() {
  logger.info('Waitlist API GET request received');
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { hasEntry: false, status: null, inviteToken: null },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const user = await currentUser();
  const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!emailRaw) {
    return NextResponse.json(
      { hasEntry: false, status: null, inviteToken: null },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const email = normalizeEmail(emailRaw);

  const [entry] = await db
    .select({ id: waitlistEntries.id, status: waitlistEntries.status })
    .from(waitlistEntries)
    .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
    .limit(1);

  const inviteToken = await (async () => {
    if (!entry?.id || entry.status !== 'invited') return null;
    const [invite] = await db
      .select({ claimToken: waitlistInvites.claimToken })
      .from(waitlistInvites)
      .where(eq(waitlistInvites.waitlistEntryId, entry.id))
      .orderBy(desc(waitlistInvites.createdAt))
      .limit(1);
    return invite?.claimToken ?? null;
  })();

  return NextResponse.json(
    {
      hasEntry: Boolean(entry),
      status: entry?.status ?? null,
      inviteToken,
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === 'development';

  try {
    const { userId } = await auth();
    if (!userId) {
      return unauthorizedResponse();
    }

    // Abuse protection: apply the same lightweight in-memory limiter used for onboarding.
    if (!isDev) {
      const clientIP = extractClientIPFromRequest({ headers: request.headers });
      await enforceOnboardingRateLimit({ userId, ip: clientIP, checkIP: true });
    }

    // Check database configuration and connectivity
    const dbCheck = await checkDatabaseConfiguration(isDev);
    if (dbCheck.errorResponse) {
      return dbCheck.errorResponse;
    }
    if (!dbCheck.hasTable) {
      const hostInfo = dbCheck.dbHost ? ` (host: ${dbCheck.dbHost})` : '';
      return serviceUnavailableResponse(
        'Waitlist is temporarily unavailable.',
        `Run pnpm drizzle:migrate to create/update waitlist tables.${hostInfo}`,
        'waitlist_table_missing'
      );
    }

    const user = await currentUser();
    const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;
    if (!emailRaw) {
      return badRequestResponse('Email is required');
    }

    const email = normalizeEmail(emailRaw);
    const fullName = deriveFullName({
      userFullName: user?.fullName,
      userUsername: user?.username,
      email,
    });

    const body = await request.json();

    // Validate request body
    const parseResult = waitlistRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return badRequestResponse(parseResult.error.flatten().fieldErrors);
    }

    const {
      primaryGoal,
      primarySocialUrl,
      spotifyUrl,
      spotifyArtistName,
      heardAbout,
      selectedPlan,
    } = parseResult.data;
    const sanitizedHeardAbout = heardAbout?.trim() || null;
    const sanitizedSpotifyArtistName = spotifyArtistName?.trim() || null;

    // Detect platform and normalize primary social URL
    const { platform, normalizedUrl } = detectPlatformFromUrl(primarySocialUrl);

    // Normalize Spotify URL if provided
    const spotifyUrlNormalized = spotifyUrl
      ? normalizeSpotifyUrl(spotifyUrl)
      : null;

    const [existing] = await db
      .select({ id: waitlistEntries.id, status: waitlistEntries.status })
      .from(waitlistEntries)
      .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
      .limit(1);

    if (existing) {
      return handleExistingEntry({
        existing,
        userId,
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

    // Create new waitlist entry with profile
    await createNewWaitlistEntry({
      userId,
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

    // Send Slack notification for new waitlist entry (fire-and-forget)
    notifySlackWaitlist(fullName, email).catch(err => {
      logger.warn('[waitlist] Slack notification failed', err);
    });

    return successResponse({ status: 'new' });
  } catch (error) {
    logger.error('Waitlist API error', error);
    await captureError('Waitlist signup failed', error, {
      route: '/api/waitlist',
      method: 'POST',
    });
    return buildPostErrorResponse(error, isDev);
  }
}
