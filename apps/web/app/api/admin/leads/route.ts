import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  extractLinktreeHandle,
  validateLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { processLeadBatch } from '@/lib/leads/process-batch';
import {
  leadListQuerySchema,
  manualLeadSubmitSchema,
} from '@/lib/validation/lead-schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * GET /api/admin/leads — List leads with filtering, search, sort, pagination.
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
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = leadListQuerySchema.parse(params);

    const conditions = [];
    if (query.status) {
      conditions.push(eq(leads.status, query.status));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(leads.linktreeHandle, `%${query.search}%`),
          ilike(leads.displayName, `%${query.search}%`)
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderColumn =
      query.sortBy === 'fitScore'
        ? leads.fitScore
        : query.sortBy === 'priorityScore'
          ? leads.priorityScore
          : query.sortBy === 'displayName'
            ? leads.displayName
            : leads.createdAt;

    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const [items, [totalRow]] = await Promise.all([
      db
        .select()
        .from(leads)
        .where(where)
        .orderBy(orderFn(orderColumn))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ count: count() }).from(leads).where(where),
    ]);

    return NextResponse.json(
      {
        items,
        total: totalRow?.count ?? 0,
        page: query.page,
        limit: query.limit,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to list leads', error, {
      route: '/api/admin/leads',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to list leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/admin/leads — Manual URL submission (single or batch).
 * Inserts new leads as 'discovered', then triggers qualification.
 */
export async function POST(request: NextRequest) {
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
    const parsed = await parseJsonBody(request, {
      route: '/api/admin/leads',
    });
    if (!parsed.ok) return parsed.response;

    const validated = manualLeadSubmitSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const results: Array<{
      url: string;
      status: 'created' | 'duplicate' | 'invalid';
      reason?: string;
    }> = [];
    const newLeadIds: string[] = [];

    for (const url of validated.data.urls) {
      const validated = validateLinktreeUrl(url);
      if (!validated) {
        results.push({
          url,
          status: 'invalid',
          reason: 'Invalid Linktree URL',
        });
        continue;
      }

      const handle = extractLinktreeHandle(url);
      if (!handle) {
        results.push({
          url,
          status: 'invalid',
          reason: 'Could not extract handle',
        });
        continue;
      }

      // Check for existing lead with same handle
      const [existing] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.linktreeHandle, handle))
        .limit(1);

      if (existing) {
        results.push({ url, status: 'duplicate' });
        continue;
      }

      const [inserted] = await db
        .insert(leads)
        .values({
          linktreeHandle: handle,
          linktreeUrl: validated,
          discoverySource: 'manual',
        })
        .returning({ id: leads.id });

      if (inserted) {
        newLeadIds.push(inserted.id);
        results.push({ url, status: 'created' });
      }
    }

    // Trigger qualification for newly created leads
    let qualificationResult = null;
    if (newLeadIds.length > 0) {
      qualificationResult = await processLeadBatch(newLeadIds);
    }

    return NextResponse.json(
      {
        results,
        summary: {
          total: results.length,
          created: results.filter(r => r.status === 'created').length,
          duplicate: results.filter(r => r.status === 'duplicate').length,
          invalid: results.filter(r => r.status === 'invalid').length,
        },
        qualification: qualificationResult,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to submit leads', error, {
      route: '/api/admin/leads',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to submit leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
