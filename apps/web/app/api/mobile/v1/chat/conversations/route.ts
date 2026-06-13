import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { listMobileConversations } from '@/lib/mobile/chat/conversations';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getMobileSessionUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const session = await getSessionContext({
      clerkUserId: userId,
      requireUser: true,
      requireProfile: true,
    });

    if (!session.profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const parsed = limitParam ? Number.parseInt(limitParam, 10) : 20;
    const limit = Number.isFinite(parsed) ? parsed : 20;

    const conversations = await listMobileConversations({
      creatorProfileId: session.profile.id,
      limit,
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
