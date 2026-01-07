import { auth, currentUser } from '@clerk/nextjs/server';
import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, waitlistEntries } from '@/lib/db';
import { users, waitlistInvites } from '@/lib/db/schema';
import { sanitizeErrorResponse } from '@/lib/error-tracking';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { normalizeEmail } from '@/lib/utils/email';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { detectPlatformFromUrl } from '@/lib/utils/social-platform';
import { waitlistRequestSchema } from '@/lib/validation/schemas';

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

export async function GET() {
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
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Abuse protection: apply the same lightweight in-memory limiter used for onboarding.
    // Always check a shared bucket for missing/unknown IPs.
    const clientIP = extractClientIPFromRequest({ headers: request.headers });
    await enforceOnboardingRateLimit({ userId, ip: clientIP, checkIP: true });

    const isDev = process.env.NODE_ENV === 'development';
    const databaseUrl = process.env.DATABASE_URL;
    const hasDatabaseUrl = Boolean(databaseUrl);

    if (!hasDatabaseUrl) {
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

    const dbHost = (() => {
      if (!isDev || !databaseUrl) return undefined;
      try {
        const parsed = new URL(databaseUrl);
        return parsed.host;
      } catch {
        return undefined;
      }
    })();

    let hasWaitlistTable = false;
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

      hasWaitlistTable = Boolean(result.rows?.[0]?.table_exists ?? false);
    } catch (error) {
      console.error('[Waitlist API] DB connectivity error:', error);
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

    // Validate request body
    const parseResult = waitlistRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { success: false, errors },
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
    const sanitizedHeardAbout = heardAbout?.trim() || null;

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
      // Avoid overwriting invited/claimed/rejected states.
      // Wrap in transaction to ensure atomicity between waitlist and user updates
      await db.transaction(async tx => {
        if (existing.status === 'new') {
          const updateValues = {
            fullName,
            primaryGoal: primaryGoal ?? null,
            primarySocialUrl,
            primarySocialPlatform: platform,
            primarySocialUrlNormalized: normalizedUrl,
            spotifyUrl: spotifyUrl ?? null,
            spotifyUrlNormalized,
            heardAbout: sanitizedHeardAbout,
            selectedPlan: selectedPlan ?? null,
            updatedAt: new Date(),
          };

          await tx
            .update(waitlistEntries)
            .set(updateValues)
            .where(eq(waitlistEntries.id, existing.id));
        }

        // Upsert users.userStatus to 'waitlist_pending' so auth gate recognizes submission
        // Use upsert to create row if Clerk user doesn't exist yet (race condition during signup)
        await tx
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
      });

      return NextResponse.json(
        { success: true, status: existing.status },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Insert waitlist entry and update user in transaction for atomicity
    const insertValues = {
      fullName,
      email,
      primaryGoal: primaryGoal ?? null,
      primarySocialUrl,
      primarySocialPlatform: platform,
      primarySocialUrlNormalized: normalizedUrl,
      spotifyUrl: spotifyUrl ?? null,
      spotifyUrlNormalized,
      heardAbout: sanitizedHeardAbout,
      selectedPlan: selectedPlan ?? null, // Quietly track pricing tier interest
      status: 'new' as const,
    };

    await db.transaction(async tx => {
      await tx.insert(waitlistEntries).values(insertValues);

      // Upsert users.userStatus to 'waitlist_pending' so auth gate recognizes submission
      // Use upsert to create row if Clerk user doesn't exist yet (race condition during signup)
      await tx
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
    });

    return NextResponse.json(
      { success: true, status: 'new' },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[Waitlist API] Error:', error);

    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
