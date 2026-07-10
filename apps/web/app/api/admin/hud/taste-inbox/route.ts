import 'server-only';

import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import {
  applyTasteAction,
  fetchTasteInbox,
  type TasteAction,
} from '@/lib/hud/taste-inbox';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const ACTIONS = new Set<TasteAction>(['approve', 'reject', 'comment']);

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;
  return NextResponse.json(await fetchTasteInbox(), {
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const issueId = typeof body.issueId === 'string' ? body.issueId.trim() : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const comment = typeof body.comment === 'string' ? body.comment : undefined;
    if (!issueId || !ACTIONS.has(action as TasteAction)) {
      return NextResponse.json(
        { error: 'issueId and a valid action are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    await applyTasteAction({ issueId, action: action as TasteAction, comment });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[api/admin/hud/taste-inbox] Action failed', error);
    await captureError('HUD taste action failed', error, {
      route: '/api/admin/hud/taste-inbox',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Could not save that decision' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
