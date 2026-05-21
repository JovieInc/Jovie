import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { FIXTURE_BOOKING_EMAILS } from '@/lib/connectors/gmail/__fixtures__/booking-emails';
import { storeTokens } from '@/lib/connectors/token-vault';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { connectorAccounts, externalObjects } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dev/connectors/seed-fixtures
 *
 * LOCAL-ONLY dev endpoint. Seeds fixture Gmail messages + Calendar connector accounts
 * so that `extractAndPropose` can run without real OAuth credentials.
 *
 * Gated by `process.env.NODE_ENV !== 'production'`.
 * Redirects to settings/connectors with ?connected=mock after seeding.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const { searchParams, origin } = new URL(request.url);
  const returnTo =
    searchParams.get('returnTo') ?? APP_ROUTES.SETTINGS_CONNECTORS;

  try {
    const { userId: clerkId } = await getCachedAuth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const FIXTURE_EMAIL = 'fixture-dj@example.com';
    const FIXTURE_TOKEN = 'fixture-access-token-dev-only';
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    // Upsert fixture Gmail connector account.
    const [gmailAccount] = await db
      .insert(connectorAccounts)
      .values({
        userId: dbUser.id,
        provider: drizzleSql`'gmail'::connector_provider`,
        providerAccountId: FIXTURE_EMAIL,
        status:
          drizzleSql`'connected'::connector_status` as unknown as 'connected',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        capabilities: { canRead: true, isMock: true },
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          status: drizzleSql`'connected'::connector_status`,
          capabilities: { canRead: true, isMock: true },
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });

    if (!gmailAccount) {
      throw new Error('Failed to upsert fixture Gmail account');
    }

    await storeTokens({
      connectorAccountId: gmailAccount.id,
      accessToken: FIXTURE_TOKEN,
      expiresAt,
    });

    // Upsert fixture Calendar connector account.
    const [calendarAccount] = await db
      .insert(connectorAccounts)
      .values({
        userId: dbUser.id,
        provider: drizzleSql`'google_calendar'::connector_provider`,
        providerAccountId: FIXTURE_EMAIL,
        status:
          drizzleSql`'connected'::connector_status` as unknown as 'connected',
        scopes: [
          'https://www.googleapis.com/auth/calendar.events.readonly',
          'https://www.googleapis.com/auth/calendar.events',
        ],
        capabilities: { canRead: true, canWrite: true, isMock: true },
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          status: drizzleSql`'connected'::connector_status`,
          capabilities: { canRead: true, canWrite: true, isMock: true },
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });

    if (!calendarAccount) {
      throw new Error('Failed to upsert fixture Calendar account');
    }

    await storeTokens({
      connectorAccountId: calendarAccount.id,
      accessToken: FIXTURE_TOKEN,
      expiresAt,
    });

    // Seed fixture Gmail messages into external_objects.
    await Promise.allSettled(
      FIXTURE_BOOKING_EMAILS.map(msg =>
        db
          .insert(externalObjects)
          .values({
            connectorAccountId: gmailAccount.id,
            provider: drizzleSql`'gmail'::connector_provider`,
            kind: 'gmail_message',
            providerId: msg.id,
            payload: {
              subject: msg.subject,
              from: msg.from,
              date: msg.date,
              snippet: msg.snippet.slice(0, 200),
            },
          })
          .onConflictDoNothing()
      )
    );

    logger.info('[dev/connectors/seed-fixtures] Fixtures seeded', {
      userId: dbUser.id,
    });

    const redirectTarget = returnTo.startsWith('/')
      ? `${origin}${returnTo}`
      : returnTo;
    return NextResponse.redirect(`${redirectTarget}?connected=mock`, {
      status: 302,
    });
  } catch (error) {
    logger.error('[dev/connectors/seed-fixtures] Error seeding fixtures', {
      error,
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
