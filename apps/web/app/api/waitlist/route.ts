import { auth, currentUser } from '@clerk/nextjs/server';
import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, waitlistEntries } from '@/lib/db';
import { waitlistInvites } from '@/lib/db/schema';
import { sanitizeErrorResponse } from '@/lib/error-tracking';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { NO_STORE_HEADERS } from '@/lib/api/constants';

export const runtime = 'nodejs';


const allowedUrlProtocols = new Set(['http:', 'https:']);

const hasSafeHttpProtocol = (value: string) => {
  try {
    const url = new URL(value);
    return allowedUrlProtocols.has(url.protocol);
  } catch {
    return false;
  }
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
 * Platform detection for waitlist primary social URL
 * Maps common social media domains to platform identifiers
 */
function detectPlatformFromUrl(url: string): {
  platform: string;
  normalizedUrl: string;
} {
  const normalizedUrl = normalizeUrl(url);

  const platformPatterns: Array<{ pattern: RegExp; platform: string }> = [
    { pattern: /(?:www\.)?instagram\.com/i, platform: 'instagram' },
    { pattern: /(?:www\.)?tiktok\.com/i, platform: 'tiktok' },
    { pattern: /(?:www\.)?youtube\.com|youtu\.be/i, platform: 'youtube' },
    { pattern: /(?:twitter\.com|x\.com)/i, platform: 'x' },
    { pattern: /(?:www\.)?twitch\.tv/i, platform: 'twitch' },
    { pattern: /(?:linktr\.ee|linktree\.com)/i, platform: 'linktree' },
    { pattern: /(?:www\.)?facebook\.com/i, platform: 'facebook' },
    { pattern: /(?:www\.)?threads\.net/i, platform: 'threads' },
    { pattern: /(?:www\.)?snapchat\.com/i, platform: 'snapchat' },
  ];

  for (const { pattern, platform } of platformPatterns) {
    if (pattern.test(normalizedUrl)) {
      return { platform, normalizedUrl };
    }
  }

  return { platform: 'unknown', normalizedUrl };
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

function isMissingWaitlistSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const mentionsWaitlist = msg.includes('waitlist_entries');
  const missingTable =
    msg.includes('does not exist') ||
    msg.includes('undefined_table') ||
    msg.includes('relation');
  const missingColumn =
    msg.includes('column') && msg.includes('does not exist');
  const mentionsNewColumns =
    msg.includes('primary_goal') || msg.includes('selected_plan');

  return (
    (mentionsWaitlist && missingTable) ||
    (mentionsWaitlist && missingColumn) ||
    (mentionsWaitlist && mentionsNewColumns)
  );
}

// Request body schema
const waitlistRequestSchema = z.object({
  primaryGoal: z.enum(['streams', 'merch', 'tickets']),
  primarySocialUrl: z
    .string()
    .trim()
    .max(2048)
    .url('Invalid URL format')
    .refine(hasSafeHttpProtocol, 'URL must start with http or https'),
  spotifyUrl: z
    .string()
    .trim()
    .max(2048)
    .url('Invalid Spotify URL')
    .refine(hasSafeHttpProtocol, 'URL must start with http or https')
    .optional()
    .nullable(),
  heardAbout: z.string().trim().max(280).optional().nullable(),
  selectedPlan: z
    .enum(['free', 'branding', 'pro', 'growth'])
    .optional()
    .nullable(),
});

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

        try {
          await db
            .update(waitlistEntries)
            .set(updateValues)
            .where(eq(waitlistEntries.id, existing.id));
        } catch (error) {
          if (!isMissingWaitlistSchemaError(error)) throw error;
          const {
            primaryGoal: _primaryGoal,
            selectedPlan: _selectedPlan,
            ...fallbackValues
          } = updateValues;
          void _primaryGoal;
          void _selectedPlan;
          await db
            .update(waitlistEntries)
            .set(fallbackValues)
            .where(eq(waitlistEntries.id, existing.id));
        }
      }

      return NextResponse.json(
        { success: true, status: existing.status },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Insert waitlist entry
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

    try {
      await db.insert(waitlistEntries).values(insertValues);
    } catch (error) {
      if (!isMissingWaitlistSchemaError(error)) throw error;
      const {
        primaryGoal: _primaryGoal,
        selectedPlan: _selectedPlan,
        ...fallbackValues
      } = insertValues;
      void _primaryGoal;
      void _selectedPlan;
      await db.insert(waitlistEntries).values(fallbackValues);
    }

    return NextResponse.json(
      { success: true, status: 'new' },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[Waitlist API] Error:', error);

    if (isMissingWaitlistSchemaError(error)) {
      const debugMsg =
        error instanceof Error
          ? error.message
          : 'Run pnpm drizzle:migrate to update waitlist schema.';
      return NextResponse.json(
        {
          success: false,
          ...sanitizeErrorResponse(
            'Waitlist is temporarily unavailable.',
            debugMsg,
            { code: 'waitlist_schema_error' }
          ),
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
