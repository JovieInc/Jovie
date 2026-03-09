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

/**
 * Decoded cursor carrying the last-seen (sortValue, id) pair.
 */
interface SubscriberCursor {
  sortValue: string | null;
  id: string;
}

/**
 * Encode a cursor from the last row of the current page.
 */
function encodeCursor(sortValue: string | null, id: string): string {
  const payload: SubscriberCursor = { sortValue, id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Decode a cursor from a base64 string. Returns null if invalid.
 */
function decodeCursor(raw: string): SubscriberCursor | null {
  try {
    const payload = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8')
    ) as unknown;
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'id' in payload &&
      typeof (payload as SubscriberCursor).id === 'string'
    ) {
      return payload as SubscriberCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const parsed = subscribersQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
        sort: searchParams.get('sort') ?? undefined,
        direction: searchParams.get('direction') ?? undefined,
        cursor: searchParams.get('cursor') ?? null,
        pageSize: searchParams.get('pageSize') ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const {
        profileId,
        sort,
        direction,
        cursor: cursorRaw,
        pageSize,
      } = parsed.data;

      // Verify user owns the profile
      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { rows: [], total: 0, nextCursor: null },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const sortCol = SORT_COLUMN_SQL[sort] ?? 'created_at';
      const dir = direction === 'asc' ? drizzleSql`ASC` : drizzleSql`DESC`;
      const isFirstPage = !cursorRaw;
      const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

      // Build the keyset WHERE clause for pagination.
      // For (sortCol ASC, id ASC): after cursor means sortValue > cursor.sortValue
      //   OR (sortValue = cursor.sortValue AND id > cursor.id)
      // For (sortCol DESC, id DESC): after cursor means sortValue < cursor.sortValue
      //   OR (sortValue = cursor.sortValue AND id < cursor.id)
      const cursorFragment = cursor
        ? direction === 'asc'
          ? drizzleSql`AND (
              ${drizzleSql.raw(sortCol)} > ${cursor.sortValue}
              OR (${drizzleSql.raw(sortCol)} = ${cursor.sortValue} AND id > ${cursor.id})
            )`
          : drizzleSql`AND (
              ${drizzleSql.raw(sortCol)} < ${cursor.sortValue}
              OR (${drizzleSql.raw(sortCol)} = ${cursor.sortValue} AND id < ${cursor.id})
            )`
        : drizzleSql``;

      // Deduplicate by contact identifier: keep the most recent subscription per
      // unique phone/email using DISTINCT ON. A subquery is required because
      // DISTINCT ON forces the first ORDER BY key to match the distinct key;
      // the outer query then applies the user-requested sort and keyset cursor filter.
      const rowsResult = await tx.execute(drizzleSql`
        SELECT id, email, phone, country_code AS "countryCode", created_at AS "createdAt", channel
        FROM (
          SELECT DISTINCT ON (COALESCE(phone, email))
            id, email, phone, country_code, created_at, channel
          FROM notification_subscriptions
          WHERE creator_profile_id = ${profileId}
          ORDER BY COALESCE(phone, email), created_at DESC
        ) deduped
        WHERE true ${cursorFragment}
        ORDER BY ${drizzleSql.raw(sortCol)} ${dir}, id ${dir}
        LIMIT ${pageSize}
      `);

      const rows = rowsResult.rows as Array<{
        id: string;
        email: string | null;
        phone: string | null;
        countryCode: string | null;
        createdAt: Date | string;
        channel: string;
      }>;

      // Derive nextCursor from the last row in the page
      const lastRow = rows[rows.length - 1];
      let nextCursor: string | null = null;
      if (rows.length === pageSize && lastRow) {
        // Pick the sort column value for the cursor
        let sortValue: string | null = null;
        if (sortCol === 'created_at') {
          const v = lastRow.createdAt;
          sortValue = v instanceof Date ? v.toISOString() : String(v);
        } else if (sortCol === 'email') {
          sortValue = lastRow.email;
        } else if (sortCol === 'phone') {
          sortValue = lastRow.phone;
        } else if (sortCol === 'country_code') {
          sortValue = lastRow.countryCode;
        }
        nextCursor = encodeCursor(sortValue, lastRow.id);
      }

      // Only run the exact COUNT on the first page to avoid per-page overhead.
      // Subsequent pages receive total: null; the client uses nextCursor === null
      // as the "no more pages" signal instead.
      if (isFirstPage) {
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
          { rows, total, nextCursor },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(
        { rows, total: null, nextCursor },
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
