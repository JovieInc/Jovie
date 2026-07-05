import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  type MobileChatTurnRequest,
  parseMobileChatTurnRequest,
} from '@/lib/mobile/chat/contract';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const userId = await getMobileSessionUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const payload = (await request
    .json()
    .catch(() => ({}))) as MobileChatTurnRequest;
  const parsed = parseMobileChatTurnRequest(payload);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { handleMobileChatTurn } = await import(
    '@/lib/mobile/chat/turn-handler'
  );
  return handleMobileChatTurn(userId, parsed, request.signal);
}
