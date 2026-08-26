import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { listMobileConversations } from '@/lib/mobile/chat/conversations';
import { requireMobileWorkspaceSession } from '@/lib/mobile/workspace';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await requireMobileWorkspaceSession(request, 20);
    if ('errorResponse' in session) {
      return session.errorResponse;
    }

    const conversations = await listMobileConversations({
      creatorProfileId: session.profile.id,
      limit: session.limit,
      workspace: session.workspace,
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
