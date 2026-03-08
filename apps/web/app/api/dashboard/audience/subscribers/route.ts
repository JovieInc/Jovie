import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { subscribersQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Maps validated sort key to the SQL column name used in the deduped subquery.
 */
const SORT_COLUMN_SQL: Record<string, string> = {
  email: 'email',
  phone: 'phone',
  country: 'country_code',
  createdAt: 'created_at',
};

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

      const sortCol = SORT_COLUMN_SQL[sort] ?? 'created_at';
      const dir = direction === 'asc' ? drizzleSql`ASC` : drizzleSql`DESC`;
      const offset = (page - 1) * pageSize;

      // Deduplicate by contact identifier: keep the most recent subscription per
      // unique phone/email using DISTINCT ON. A subquery is required because
      // DISTINCT ON forces the first ORDER BY key to match the distinct key;
      // the outer query then applies the user-requested sort and pagination.
      const rowsResult = await tx.execute(drizzleSql`
        SELECT id, email, phone, country_code AS "countryCode", created_at AS "createdAt", channel
        FROM (
          SELECT DISTINCT ON (COALESCE(phone, email))
            id, email, phone, country_code, created_at, channel
          FROM notification_subscriptions
          WHERE creator_profile_id = ${profileId}
          ORDER BY COALESCE(phone, email), created_at DESC
        ) deduped
        ORDER BY ${drizzleSql.raw(sortCol)} ${dir}
        LIMIT ${pageSize} OFFSET ${offset}
      `);

      const rows = rowsResult.rows as Array<{
        id: string;
        email: string | null;
        phone: string | null;
        countryCode: string | null;
        createdAt: Date | string;
        channel: string;
      }>;

      // Only run the exact COUNT on the first page to avoid per-page overhead.
      // Subsequent pages receive total: null; the client uses rows.length < pageSize
      // as the "no more pages" signal instead.
      if (page === 1) {
        const countResult = await tx.execute(drizzleSql`
          SELECT COUNT(*) AS total
          FROM (
            SELECT DISTINCT ON (COALESCE(phone, email)) id
            FROM notification_subscriptions
            WHERE creator_profile_id = ${profileId}
            ORDER BY COALESCE(phone, email), created_at DESC
          ) deduped
        `);

        const total = Number(
          (countResult.rows[0] as { total: string | number } | undefined)
            ?.total ?? 0
        );

        return NextResponse.json(
          { rows, total },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

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
