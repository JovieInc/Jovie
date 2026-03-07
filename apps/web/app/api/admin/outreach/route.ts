import { and, asc, count, desc, eq, isNotNull } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { outreachListQuerySchema } from '@/lib/validation/lead-schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * GET /api/admin/outreach — List outreach leads by queue.
 */
export async function GET(request: NextRequest) {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = outreachListQuerySchema.safeParse(searchParams);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: validated.error.flatten(),
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { queue, sort, sortOrder, page, limit } = validated.data;
    const offset = (page - 1) * limit;

    // Build filter conditions
    const conditions = [isNotNull(leads.outreachRoute)];
    if (queue !== 'all') {
      conditions.push(eq(leads.outreachRoute, queue));
    }

    const whereClause = and(...conditions);

    // Sort
    const sortColumn =
      sort === 'priorityScore' ? leads.priorityScore : leads.createdAt;
    const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Query data and count in parallel
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(leads)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(leads).where(whereClause),
    ]);

    return NextResponse.json(
      {
        items: rows,
        total: totalRow?.total ?? 0,
        page,
        limit,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to list outreach leads', error, {
      route: '/api/admin/outreach',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to list outreach leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
