import 'server-only';

import { isAdmin } from '@/lib/admin/roles';
import { getFreshAuth } from '@/lib/auth/cached';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';

/**
 * Operator (OV) chat mode (JOV-4810). The OV chat surface at /app/ov/chat
 * tags each turn body with `chatMode: 'ov'`; the chat route validates the
 * literal and gates the mode on an admin role before running the turn.
 */

export type ChatMode = 'ov';

export type ChatModeParseResult =
  | { readonly ok: true; readonly chatMode: ChatMode | null }
  | { readonly ok: false };

/**
 * Only the literal 'ov' is meaningful. Absent = customer (artist) mode.
 * Any other value is a malformed request and must be rejected by the caller.
 */
export function parseChatMode(value: unknown): ChatModeParseResult {
  if (value === undefined || value === null) {
    return { ok: true, chatMode: null };
  }
  if (value === 'ov') {
    return { ok: true, chatMode: 'ov' };
  }
  return { ok: false };
}

/** OV chat turns are internal-tool only; fail closed for non-admins. */
export async function canUseOvChatMode(
  userId: string | null
): Promise<boolean> {
  if (!userId) return false;
  if (!(await isAdmin(userId))) return false;
  try {
    const auth = await getFreshAuth();
    if (auth.userId !== userId || !auth.sessionId) return false;
    await assertOviePrivacyUnlocked({ userId, sessionId: auth.sessionId });
    return true;
  } catch {
    return false;
  }
}
