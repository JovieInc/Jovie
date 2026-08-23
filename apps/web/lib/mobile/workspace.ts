import 'server-only';

import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/roles';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { requireMobileProfileSession } from '@/lib/mobile/session-auth';
import type { AppShellMode } from '@/types/app-shell';

export type MobileWorkspaceParseResult =
  | { readonly ok: true; readonly workspace: AppShellMode }
  | { readonly ok: false };

export const MOBILE_OV_CONVERSATION_TITLE_PREFIX = 'OV | ';

export function parseMobileWorkspace(
  value: string | null | undefined
): MobileWorkspaceParseResult {
  if (value === undefined || value === null || value === '') {
    return { ok: true, workspace: 'customer' };
  }
  if (value === 'customer' || value === 'ov') {
    return { ok: true, workspace: value };
  }
  return { ok: false };
}

export function isOvConversationTitle(
  title: string | null | undefined
): boolean {
  return (title ?? '').startsWith(MOBILE_OV_CONVERSATION_TITLE_PREFIX);
}

export function withOvConversationTitle(title: string | null): string {
  const base = title?.trim() || 'Summer';
  return base.startsWith(MOBILE_OV_CONVERSATION_TITLE_PREFIX)
    ? base
    : `${MOBILE_OV_CONVERSATION_TITLE_PREFIX}${base}`;
}

export type MobileWorkspaceAccess =
  | { readonly ok: true; readonly workspace: AppShellMode }
  | { readonly ok: false; readonly status: 400 | 403; readonly error: string };

export async function authorizeMobileWorkspace(
  raw: string | null,
  userId: string
): Promise<MobileWorkspaceAccess> {
  const parsed = parseMobileWorkspace(raw);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: 'Invalid workspace' };
  }
  if (parsed.workspace === 'ov' && !(await isAdmin(userId))) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, workspace: parsed.workspace };
}

type MobileProfileSession = Exclude<
  Awaited<ReturnType<typeof requireMobileProfileSession>>,
  { errorResponse: NextResponse }
>;

export async function requireMobileWorkspaceSession(
  request: Request,
  defaultLimit: number
): Promise<
  | {
      readonly profile: MobileProfileSession['profile'];
      readonly userId: string;
      readonly workspace: AppShellMode;
      readonly url: URL;
      readonly limit: number;
    }
  | { readonly errorResponse: NextResponse }
> {
  const auth = await requireMobileProfileSession(request);
  if ('errorResponse' in auth) {
    return auth;
  }

  const url = new URL(request.url);
  const workspace = await authorizeMobileWorkspace(
    url.searchParams.get('workspace'),
    auth.userId
  );
  if (!workspace.ok) {
    return {
      errorResponse: NextResponse.json(
        { error: workspace.error },
        { status: workspace.status, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const limitParam = url.searchParams.get('limit');
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : defaultLimit;

  return {
    profile: auth.profile,
    userId: auth.userId,
    workspace: workspace.workspace,
    url,
    limit: Number.isFinite(parsed) ? parsed : defaultLimit,
  };
}
