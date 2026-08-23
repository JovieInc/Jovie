import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getMobileConversationDetail } from '@/lib/mobile/chat/conversations';
import {
  isOvConversationTitle,
  requireMobileWorkspaceSession,
} from '@/lib/mobile/workspace';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await requireMobileWorkspaceSession(request, 100);
    if ('errorResponse' in session) {
      return session.errorResponse;
    }

    const before = session.url.searchParams.get('before');

    let detail;
    try {
      detail = await getMobileConversationDetail({
        conversationId: id,
        creatorProfileId: session.profile.id,
        limit: session.limit,
        before,
      });
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message === 'INVALID_BEFORE_CURSOR'
      ) {
        return NextResponse.json(
          { error: 'Invalid "before" cursor' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw error;
    }

    if (!detail) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const isOv = isOvConversationTitle(detail.conversation.title);
    if (session.workspace === 'ov' ? !isOv : isOv) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        conversation: {
          id: detail.conversation.id,
          title: detail.conversation.title,
          createdAt: detail.conversation.createdAt.toISOString(),
          updatedAt: detail.conversation.updatedAt.toISOString(),
        },
        messages: detail.messages.map(message => ({
          id: message.id,
          role: message.role,
          content: message.content,
          clientMessageId: message.clientMessageId,
          turnId: message.turnId,
          turnStatus: message.turnStatus,
          createdAt: message.createdAt.toISOString(),
          requiresWebHandoff: message.requiresWebHandoff,
        })),
        hasMore: detail.hasMore,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Mobile chat conversation detail route failed', error, {
      route: '/api/mobile/v1/chat/conversations/[id]',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
