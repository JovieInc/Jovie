import { asc, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { subscribersQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const SORTABLE_COLUMNS = {
  email: notificationSubscriptions.email,
  phone: notificationSubscriptions.phone,
  country: notificationSubscriptions.countryCode,
  createdAt: notificationSubscriptions.createdAt,
} as const;

export async function GET(request: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const parsed = subscribersQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
        sort: searchParams.get('sort') ?? undefined,
        direction: searchParams.get('direction') ?? undefined,
        page: searchParams.get('page') ?? undefined,
        pageSize: searchParams.get('pageSize') ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { profileId, sort, direction, page, pageSize } = parsed.data;

      // Verify user owns the profile
      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { rows: [], total: 0 },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const sortColumn = SORTABLE_COLUMNS[sort];
      const orderFn = direction === 'asc' ? asc : desc;
      const offset = (page - 1) * pageSize;

      const rowsQuery = tx
        .select({
          id: notificationSubscriptions.id,
          email: notificationSubscriptions.email,
          phone: notificationSubscriptions.phone,
          countryCode: notificationSubscriptions.countryCode,
          createdAt: notificationSubscriptions.createdAt,
          channel: notificationSubscriptions.channel,
        })
        .from(notificationSubscriptions)
        .where(eq(notificationSubscriptions.creatorProfileId, profileId))
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset(offset);

      // Only run the exact COUNT on the first page to avoid per-page overhead.
      // Subsequent pages receive total: null; the client uses rows.length < pageSize
      // as the "no more pages" signal instead.
      if (page === 1) {
        const [rows, [{ total }]] = await Promise.all([
          rowsQuery,
          tx
            .select({
              total: drizzleSql`COALESCE(COUNT(${notificationSubscriptions.id}), 0)`,
            })
            .from(notificationSubscriptions)
            .where(eq(notificationSubscriptions.creatorProfileId, profileId)),
        ]);

        return NextResponse.json(
          { rows, total: Number(total ?? 0) },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const rows = await rowsQuery;
      return NextResponse.json(
        { rows, total: null },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    logger.error('Error fetching notification subscribers', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Audience subscribers fetch failed', error, {
        route: '/api/dashboard/audience/subscribers',
        method: 'GET',
      });
    }
    return NextResponse.json(
      { error: 'Failed to load subscribers' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
