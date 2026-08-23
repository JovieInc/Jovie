import 'server-only';

import { isAdmin } from '@/lib/admin/roles';
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
