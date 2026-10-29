import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionErrorResponse } from '@/app/api/chat/session-error-response';
import { getSessionContext } from '@/lib/auth/session';
import { canUseOvChatMode } from '@/lib/chat/ov-mode';
import {
  authorizeFounderSummerUser,
  founderPrincipalHash,
} from '@/lib/ovie/summer-founder-auth';

export const SUMMER_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/** Founder-only gate for Summer voice routes: session, founder id, admin role. */
export async function requireFounderPrincipal(): Promise<
  { readonly principalHash: string } | NextResponse
> {
  let userId: string;
  try {
    const { user } = await getSessionContext({ requireUser: true });
    userId = user.id;
  } catch (error) {
    return (
      getSessionErrorResponse(error, SUMMER_NO_STORE_HEADERS) ??
      NextResponse.json(
        { error: 'session_unavailable' },
        { status: 503, headers: SUMMER_NO_STORE_HEADERS }
      )
    );
  }
  const authorization = authorizeFounderSummerUser(userId);
  if (authorization !== 'authorized') {
    return NextResponse.json(
      { error: 'founder_required' },
      {
        status: authorization === 'unconfigured' ? 503 : 403,
        headers: SUMMER_NO_STORE_HEADERS,
      }
    );
  }
  try {
    if (!(await canUseOvChatMode(userId))) {
      return NextResponse.json(
        { error: 'admin_required' },
        { status: 403, headers: SUMMER_NO_STORE_HEADERS }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'admin_check_unavailable' },
      { status: 503, headers: SUMMER_NO_STORE_HEADERS }
    );
  }
  return { principalHash: founderPrincipalHash(userId) };
}
