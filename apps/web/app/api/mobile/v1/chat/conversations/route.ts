import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { listMobileConversations } from '@/lib/mobile/chat/conversations';
import { requireMobileProfileSession } from '@/lib/mobile/session-auth';
import { authorizeMobileWorkspace } from '@/lib/mobile/workspace';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireMobileProfileSession(request);
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const url = new URL(request.url);
    const workspace = await authorizeMobileWorkspace(
      url.searchParams.get('workspace'),
      auth.userId
    );
    if (!workspace.ok) {
      return NextResponse.json(
        { error: workspace.error },
        { status: workspace.status, headers: NO_STORE_HEADERS }
      );
    }

    const limitParam = url.searchParams.get('limit');
    const parsed = limitParam ? Number.parseInt(limitParam, 10) : 20;
    const limit = Number.isFinite(parsed) ? parsed : 20;

    const conversations = await listMobileConversations({
      creatorProfileId: auth.profile.id,
      limit,
      workspace: workspace.workspace,
    });

    return NextResponse.json(
      {
        conversations: conversations.map(conversation => ({
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
