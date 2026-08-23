import type { AppShellMode } from '@/types/app-shell';

/**
 * Mobile workspace ids match web `APP_SHELL_WORKSPACES` (`customer` / `ov`).
 * Absent/empty = artist (Jovie) mode so existing clients stay unchanged.
 */
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
  if (base.startsWith(MOBILE_OV_CONVERSATION_TITLE_PREFIX)) {
    return base;
  }
  return `${MOBILE_OV_CONVERSATION_TITLE_PREFIX}${base}`;
}
