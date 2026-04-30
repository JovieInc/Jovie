import { currentUser } from '@clerk/nextjs/server';
import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db, doesTableExist } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries, waitlistInvites } from '@/lib/db/schema/waitlist';
import { captureError, sanitizeErrorResponse } from '@/lib/error-tracking';
import { RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { normalizeEmail } from '@/lib/utils/email';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import { waitlistRequestSchema } from '@/lib/validation/schemas';
import { submitWaitlistAccessRequest } from '@/lib/waitlist/access-request';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
    {
      status: 503,
      headers: { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_SERVICE },
    }
  );
}

function badRequestResponse(errorOrErrors: string | Record<string, unknown>) {
  const body =
    typeof errorOrErrors === 'string'
      ? { success: false, error: errorOrErrors }
      : { success: false, errors: errorOrErrors };
  return NextResponse.json(body, { status: 400, headers: NO_STORE_HEADERS });
}

function deriveFullName(params: {
  readonly userFullName: string | null | undefined;
  readonly userUsername: string | null | undefined;
  readonly email: string;
}): string {
  const fromUser = (params.userFullName ?? '').trim();
  if (fromUser) return fromUser;

  const fromUsername = (params.userUsername ?? '').trim();
  if (fromUsername) return fromUsername;

  const localPart = params.email.split('@')[0]?.trim();
  return localPart || 'Jovie user';
}

async function ensureWaitlistTable() {
  try {
    return await doesTableExist('waitlist_entries');
  } catch (error) {
    logger.error('Waitlist API DB connectivity error', error);
    return false;
  }
}

export async function GET() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { hasEntry: false, status: null },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const user = await currentUser();
  const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!emailRaw) {
    return NextResponse.json(
      { hasEntry: false, status: null },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const email = normalizeEmail(emailRaw);

  const [entry] = await db
    .select({ id: waitlistEntries.id, status: waitlistEntries.status })
    .from(waitlistEntries)
    .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
    .orderBy(desc(waitlistEntries.createdAt))
    .limit(1);

  const invite = await (async () => {
    if (!entry?.id || entry.status !== 'invited') return null;
    const [row] = await db
      .select({
        username: creatorProfiles.username,
      })
      .from(waitlistInvites)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, waitlistInvites.creatorProfileId)
      )
      .where(eq(waitlistInvites.waitlistEntryId, entry.id))
      .orderBy(desc(waitlistInvites.createdAt))
      .limit(1);
    return row ?? null;
  })();

  return NextResponse.json(
    {
      hasEntry: Boolean(entry),
      status: entry?.status ?? null,
      inviteUsername: invite?.username ?? null,
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === 'development';

  try {
    const { userId } = await getCachedAuth();
    if (!userId) return unauthorizedResponse();

    if (!isDev) {
      const clientIP = extractClientIPFromRequest({ headers: request.headers });
      await enforceOnboardingRateLimit({ userId, ip: clientIP, checkIP: true });
    }

    const hasWaitlistTable = await ensureWaitlistTable();
    if (!hasWaitlistTable) {
      return serviceUnavailableResponse(
        'Waitlist is temporarily unavailable.',
        'Run pnpm drizzle:migrate to create or update waitlist tables.',
        'waitlist_table_missing'
      );
    }

    const user = await currentUser();
    const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;
    if (!emailRaw) return badRequestResponse('Email is required');

    const email = normalizeEmail(emailRaw);
    const fullName = deriveFullName({
      userFullName: user?.fullName,
      userUsername: user?.username,
      email,
    });

    const body = await request.json();
    const parseResult = waitlistRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return badRequestResponse(parseResult.error.flatten().fieldErrors);
    }

    const result = await submitWaitlistAccessRequest({
      clerkUserId: userId,
      email,
      emailRaw,
      fullName,
      data: parseResult.data,
    });

    return NextResponse.json(
      {
        success: true,
        status: result.status,
        outcome: result.outcome,
        entryId: result.entryId,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Waitlist API error', error);
    await captureError('Waitlist signup failed', error, {
      route: '/api/waitlist',
      method: 'POST',
    });
    const errorMessage =
      isDev && error instanceof Error
        ? error.message
        : 'Something went wrong. Please try again.';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
