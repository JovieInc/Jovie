import { NextResponse } from 'next/server';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { buildMobileInbox } from '@/lib/mobile/action-loop-inbox';
import { resolveMobileReadyProfile } from '@/lib/mobile/ready-profile-route';
import { buildMobileTasteInbox } from '@/lib/mobile/taste-inbox';
import { parseMobileWorkspace } from '@/lib/mobile/workspace';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const resolved = await resolveMobileReadyProfile(request);
    if (!resolved.ok) {
      return resolved.response;
    }

    const workspaceResult = parseMobileWorkspace(
      new URL(request.url).searchParams.get('workspace')
    );
    if (!workspaceResult.ok) {
      return NextResponse.json(
        { error: 'Invalid workspace' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (workspaceResult.workspace === 'ov') {
      if (!(await checkAdminRole(resolved.context.clerkUserId))) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      const ovPayload = await buildMobileTasteInbox();
      return NextResponse.json(ovPayload, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    const payload = await buildMobileInbox(resolved.context.clerkUserId);
    if (!payload) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Mobile inbox route failed', error, {
      route: '/api/mobile/v1/inbox',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
