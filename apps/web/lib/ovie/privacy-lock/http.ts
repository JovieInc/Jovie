import 'server-only';

import { NextResponse } from 'next/server';
// @coverage-via apps/web/app/api/ovie/privacy-lock/route.test.ts
import { isAdmin } from '@/lib/admin/roles';
import { getFreshAuth } from '@/lib/auth/cached';
import { privacyErrorResponse } from '@/lib/ovie/privacy-lock/access';
import {
  getOviePrivacyLockState,
  mutateOviePrivacyLock,
  OviePrivacyLockError,
  type PrivacyAction,
  type PrivacyAuth,
} from '@/lib/ovie/privacy-lock/server';

const HEADERS = { 'Cache-Control': 'private, no-store' } as const;
async function identity(): Promise<PrivacyAuth> {
  const auth = await getFreshAuth();
  if (!auth.userId || !auth.sessionId)
    throw new OviePrivacyLockError('UNAUTHORIZED', 'Please sign in.', 401);
  if (!(await isAdmin(auth.userId)))
    throw new OviePrivacyLockError('FORBIDDEN', 'Ovie requires admin access.');
  return { userId: auth.userId, sessionId: auth.sessionId };
}
export async function GET() {
  try {
    return NextResponse.json(await getOviePrivacyLockState(await identity()), {
      headers: HEADERS,
    });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin)
      throw new OviePrivacyLockError(
        'FORBIDDEN_ORIGIN',
        'Use this Ovie window to change privacy settings.'
      );
    const auth = await identity();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OviePrivacyLockError(
        'INVALID_ACTION',
        'Choose a valid privacy action.',
        400
      );
    }
    const action =
      body && typeof body === 'object' && 'action' in body ? body.action : null;
    if (!['enable', 'disable', 'lock', 'unlock'].includes(action as string))
      throw new OviePrivacyLockError(
        'INVALID_ACTION',
        'Choose a valid privacy action.',
        400
      );
    return NextResponse.json(
      await mutateOviePrivacyLock(auth, action as PrivacyAction),
      { headers: HEADERS }
    );
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
