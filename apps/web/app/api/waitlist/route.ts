import { randomUUID } from 'node:crypto';
import { auth, currentUser } from '@clerk/nextjs/server';
import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, type TransactionType, waitlistEntries } from '@/lib/db';
import { creatorProfiles, users, waitlistInvites } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { sanitizeErrorResponse } from '@/lib/error-tracking';
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
  tx: TransactionType,
  base: string
): Promise<string> {
  const normalizedBase = normalizeUsername(base).slice(0, 30);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i += 1) {
    const suffix = i === 0 ? '' : `-${i}`;
    const candidate = `${normalizedBase.slice(0, 30 - suffix.length)}${suffix}`;
    if (!validateUsername(candidate).isValid) continue;

    const [existing] = await tx
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

function getDbHost(): string | undefined {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' || !env.DATABASE_URL) return undefined;
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return undefined;
  }
}

async function checkDatabaseAvailability(): Promise<NextResponse | null> {
  if (!env.DATABASE_URL) {
    return NextResponse.json(
      {
        success: false,
        ...sanitizeErrorResponse(
          'Waitlist is temporarily unavailable.',
          'Set DATABASE_URL in .env.local and restart pnpm dev.',
          { code: 'db_not_configured' }
        ),
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const dbHost = getDbHost();

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

    const hasWaitlistTable = Boolean(result.rows?.[0]?.table_exists ?? false);

    if (!hasWaitlistTable) {
      return NextResponse.json(
        {
          success: false,
          ...sanitizeErrorResponse(
            'Waitlist is temporarily unavailable.',
            `Run pnpm drizzle:migrate to create/update waitlist tables.${dbHost ? ` (host: ${dbHost})` : ''}`,
            { code: 'waitlist_table_missing' }
          ),
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    return null;
  } catch (error) {
    logger.error('Waitlist API DB connectivity error', error);
    const debugMsg =
      error instanceof Error
        ? `${error.message}${dbHost ? ` (host: ${dbHost})` : ''}`
        : `Database connection failed${dbHost ? ` (host: ${dbHost})` : ''}. Check Neon is reachable and credentials are valid.`;
    return NextResponse.json(
      {
        success: false,
        ...sanitizeErrorResponse(
          'Waitlist is temporarily unavailable.',
          debugMsg,
          { code: 'db_unreachable' }
        ),
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

async function handleExistingEntry(
  existing: { id: string; status: string },
  userId: string,
  emailRaw: string,
  entryData: {
    fullName: string;
    primaryGoal: string | null;
    primarySocialUrl: string;
    platform: string;
    normalizedUrl: string;
    spotifyUrl: string | null;
    spotifyUrlNormalized: string | null;
    heardAbout: string | null;
    selectedPlan: string | null;
  }
): Promise<NextResponse> {
  await db.transaction(async tx => {
    if (existing.status === 'new') {
      await tx
        .update(waitlistEntries)
        .set({
          fullName: entryData.fullName,
          primaryGoal: entryData.primaryGoal,
          primarySocialUrl: entryData.primarySocialUrl,
          primarySocialPlatform: entryData.platform,
          primarySocialUrlNormalized: entryData.normalizedUrl,
          spotifyUrl: entryData.spotifyUrl,
          spotifyUrlNormalized: entryData.spotifyUrlNormalized,
          heardAbout: entryData.heardAbout,
          selectedPlan: entryData.selectedPlan,
          updatedAt: new Date(),
        })
        .where(eq(waitlistEntries.id, existing.id));
    }

    await tx
      .insert(users)
      .values({
        clerkId: userId,
        email: emailRaw,
        userStatus: 'waitlist_pending',
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: { userStatus: 'waitlist_pending', updatedAt: new Date() },
      });
  });

  return NextResponse.json(
    { success: true, status: existing.status },
    { headers: NO_STORE_HEADERS }
  );
}

async function createNewEntry(
  userId: string,
  emailRaw: string,
  email: string,
  entryData: {
    fullName: string;
    primaryGoal: string | null;
    primarySocialUrl: string;
    platform: string;
    normalizedUrl: string;
    spotifyUrl: string | null;
    spotifyUrlNormalized: string | null;
    heardAbout: string | null;
    selectedPlan: string | null;
  }
): Promise<void> {
  await db.transaction(async tx => {
    const [entry] = await tx
      .insert(waitlistEntries)
      .values({
        fullName: entryData.fullName,
        email,
        primaryGoal: entryData.primaryGoal,
        primarySocialUrl: entryData.primarySocialUrl,
        primarySocialPlatform: entryData.platform,
        primarySocialUrlNormalized: entryData.normalizedUrl,
        spotifyUrl: entryData.spotifyUrl,
        spotifyUrlNormalized: entryData.spotifyUrlNormalized,
        heardAbout: entryData.heardAbout,
        selectedPlan: entryData.selectedPlan,
        status: 'new' as const,
      })
      .returning({ id: waitlistEntries.id });

    if (!entry) throw new Error('Failed to create waitlist entry');

    const handleCandidate =
      extractHandleFromUrl(entryData.normalizedUrl) ??
      email.split('@')[0] ??
      safeRandomHandle();

    const baseHandle = validateUsername(handleCandidate).isValid
      ? handleCandidate
      : safeRandomHandle();

    const usernameNormalized = await findAvailableHandle(tx, baseHandle);
    const trimmedName = entryData.fullName.trim();
    const displayName = trimmedName
      ? trimmedName.slice(0, 50)
      : 'Jovie creator';

    await tx.insert(creatorProfiles).values({
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

    await tx
      .insert(users)
      .values({
        clerkId: userId,
        email: emailRaw,
        userStatus: 'waitlist_pending',
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: { userStatus: 'waitlist_pending', updatedAt: new Date() },
      });
  });
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const isDev = env.NODE_ENV === 'development';

    if (!isDev) {
      const clientIP = extractClientIPFromRequest({ headers: request.headers });
      await enforceOnboardingRateLimit({ userId, ip: clientIP, checkIP: true });
    }

    const dbError = await checkDatabaseAvailability();
    if (dbError) return dbError;

    const user = await currentUser();
    const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;
    if (!emailRaw) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const email = normalizeEmail(emailRaw);
    const fullName = deriveFullName({
      userFullName: user?.fullName,
      userUsername: user?.username,
      email,
    });

    const body = await request.json();
    const parseResult = waitlistRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, errors: parseResult.error.flatten().fieldErrors },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      primaryGoal,
      primarySocialUrl,
      spotifyUrl,
      heardAbout,
      selectedPlan,
    } = parseResult.data;
    const { platform, normalizedUrl } = detectPlatformFromUrl(primarySocialUrl);

    const entryData = {
      fullName,
      primaryGoal: primaryGoal ?? null,
      primarySocialUrl,
      platform,
      normalizedUrl,
      spotifyUrl: spotifyUrl ?? null,
      spotifyUrlNormalized: spotifyUrl ? normalizeSpotifyUrl(spotifyUrl) : null,
      heardAbout: heardAbout?.trim() || null,
      selectedPlan: selectedPlan ?? null,
    };

    const [existing] = await db
      .select({ id: waitlistEntries.id, status: waitlistEntries.status })
      .from(waitlistEntries)
      .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
      .limit(1);

    if (existing) {
      return handleExistingEntry(existing, userId, emailRaw, entryData);
    }

    await createNewEntry(userId, emailRaw, email, entryData);

    return NextResponse.json(
      { success: true, status: 'new' },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Waitlist API error', error);
    const isDev = env.NODE_ENV === 'development';
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
}
