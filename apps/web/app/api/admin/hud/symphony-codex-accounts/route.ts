import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import {
  APPROVED_CODEX_ACCOUNT_LABELS,
  isApprovedCodexAccountLabel,
} from '@/lib/hud/symphony-codex-accounts';
import {
  inspectSymphonyCodexAccounts,
  reconnectSymphonyCodexAccount,
} from '@/lib/hud/symphony-codex-accounts.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const reconnectSchema = z.object({
  account: z.enum(APPROVED_CODEX_ACCOUNT_LABELS),
  confirm: z.literal(true),
});

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    const snapshot = await inspectSymphonyCodexAccounts();
    return NextResponse.json(snapshot, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/symphony-codex-accounts] inspect failed',
      error
    );
    await captureError('HUD Symphony Codex account inspect failed', error, {
      route: '/api/admin/hud/symphony-codex-accounts',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to inspect Codex accounts' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = reconnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!isApprovedCodexAccountLabel(parsed.data.account)) {
      return NextResponse.json(
        { error: 'Account is not approved' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const snapshot = await reconnectSymphonyCodexAccount(parsed.data.account);
    return NextResponse.json(snapshot, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/symphony-codex-accounts] reconnect failed',
      error
    );
    await captureError('HUD Symphony Codex account reconnect failed', error, {
      route: '/api/admin/hud/symphony-codex-accounts',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to reconnect Codex account' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
