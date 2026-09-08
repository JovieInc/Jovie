import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import { APPROVED_CODEX_ACCOUNT_LABELS } from '@/lib/hud/symphony-codex-accounts';
import {
  inspectSymphonyCodexAccounts,
  reconnectSymphonyCodexAccount,
} from '@/lib/hud/symphony-codex-accounts.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const HEADERS = { 'Cache-Control': 'no-store' } as const;
const reconnectSchema = z.object({
  account: z.enum(APPROVED_CODEX_ACCOUNT_LABELS),
  confirm: z.literal(true),
});

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

async function fail(
  method: 'GET' | 'POST',
  error: unknown,
  message: string
): Promise<Response> {
  logger.error(
    `[api/admin/hud/symphony-codex-accounts] ${method} failed`,
    error
  );
  await captureError(`HUD Symphony Codex account ${method} failed`, error, {
    route: '/api/admin/hud/symphony-codex-accounts',
    method,
  });
  return json({ error: message }, 500);
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;
  try {
    return json(await inspectSymphonyCodexAccounts(), 200);
  } catch (error) {
    return fail('GET', error, 'Failed to inspect Codex accounts');
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
      return json({ error: 'Invalid JSON payload' }, 400);
    }
    const parsed = reconnectSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Invalid payload' }, 400);
    return json(await reconnectSymphonyCodexAccount(parsed.data.account), 200);
  } catch (error) {
    return fail('POST', error, 'Failed to reconnect Codex account');
  }
}
