import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { discoveryKeywords } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

const keywordCreateSchema = z.object({
  queries: z.array(z.string().min(1).max(500)).min(1).max(100),
});

const keywordDeleteSchema = z.object({
  id: z.string().uuid(),
});

const keywordToggleSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

export async function GET() {
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
    const keywords = await db.select().from(discoveryKeywords);
    return NextResponse.json(
      { keywords },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to list keywords', error, {
      route: '/api/admin/leads/keywords',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to list keywords') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

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
      route: '/api/admin/leads/keywords',
    });
    if (!parsed.ok) return parsed.response;

    const validated = keywordCreateSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const inserted = await db
      .insert(discoveryKeywords)
      .values(validated.data.queries.map(q => ({ query: q })))
      .onConflictDoNothing({ target: discoveryKeywords.query })
      .returning();

    return NextResponse.json(
      { keywords: inserted, count: inserted.length },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to add keywords', error, {
      route: '/api/admin/leads/keywords',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to add keywords') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
      route: '/api/admin/leads/keywords',
    });
    if (!parsed.ok) return parsed.response;

    const validated = keywordToggleSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [updated] = await db
      .update(discoveryKeywords)
      .set({ enabled: validated.data.enabled })
      .where(eq(discoveryKeywords.id, validated.data.id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Keyword not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(updated, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Failed to toggle keyword', error, {
      route: '/api/admin/leads/keywords',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to toggle keyword') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
      route: '/api/admin/leads/keywords',
    });
    if (!parsed.ok) return parsed.response;

    const validated = keywordDeleteSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [deleted] = await db
      .delete(discoveryKeywords)
      .where(eq(discoveryKeywords.id, validated.data.id))
      .returning({ id: discoveryKeywords.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Keyword not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to delete keyword', error, {
      route: '/api/admin/leads/keywords',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to delete keyword') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
