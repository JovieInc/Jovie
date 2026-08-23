import { NextResponse } from 'next/server';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { listMobileConversations } from '@/lib/mobile/chat/conversations';
import { requireMobileProfileSession } from '@/lib/mobile/session-auth';
import {
  isOvConversationTitle,
  parseMobileWorkspace,
} from '@/lib/mobile/workspace';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireMobileProfileSession(request);
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const url = new URL(request.url);
    const workspaceResult = parseMobileWorkspace(
      url.searchParams.get('workspace')
    );
    if (!workspaceResult.ok) {
      return NextResponse.json(
        { error: 'Invalid workspace' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (
      workspaceResult.workspace === 'ov' &&
      !(await checkAdminRole(auth.userId))
    ) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const limitParam = url.searchParams.get('limit');
    const parsed = limitParam ? Number.parseInt(limitParam, 10) : 20;
    const limit = Number.isFinite(parsed) ? parsed : 20;

    const conversations = await listMobileConversations({
      creatorProfileId: auth.profile.id,
      limit: 50,
    });
    const scoped = conversations.filter(conversation => {
      const isOv = isOvConversationTitle(conversation.title);
      return workspaceResult.workspace === 'ov' ? isOv : !isOv;
    });

    return NextResponse.json(
      {
        conversations: scoped.slice(0, limit).map(conversation => ({
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
          latestMessageRole: conversation.latestMessageRole,
          latestTurnStatus: conversation.latestTurnStatus,
        })),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Mobile chat conversations route failed', error, {
      route: '/api/mobile/v1/chat/conversations',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
