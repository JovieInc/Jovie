import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import {
  closeLinearIssue,
  fetchTimActionIssues,
} from '@/lib/hud/linear-actions';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/admin/hud/tim-actions
 *
 * Returns all Linear issues labeled `tim-action-required` that are in an
 * active state (triage, unstarted, started). Admin-only.
 */
export async function GET(): Promise<Response> {
  try {
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

    const result = await fetchTimActionIssues();
    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/tim-actions] Failed to fetch tim-action issues',
      error
    );
    await captureError('HUD tim-actions fetch failed', error, {
      route: '/api/admin/hud/tim-actions',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch tim-action issues' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/admin/hud/tim-actions
 *
 * Body: { issueId: string }
 *
 * Closes a Linear issue. Admin-only.
 */
export async function POST(request: Request): Promise<Response> {
  try {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).issueId !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Invalid payload: issueId (string) required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const issueId = (body as { issueId: string }).issueId.trim();

    if (!issueId) {
      return NextResponse.json(
        { error: 'issueId must not be empty' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const success = await closeLinearIssue(issueId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to close issue in Linear' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[api/admin/hud/tim-actions] Failed to close issue', error);
    await captureError('HUD tim-actions close failed', error, {
      route: '/api/admin/hud/tim-actions',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
