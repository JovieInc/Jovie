import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  SaveTeleprompterTakeSchema,
  toTeleprompterTakeSummary,
} from '@/lib/teleprompter/takes/contract';
import { teleprompterTakeErrorResponse } from '@/lib/teleprompter/takes/route-error';
import {
  listTeleprompterTakes,
  saveTeleprompterTake,
} from '@/lib/teleprompter/takes/server';

export const runtime = 'nodejs';

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const takes = await listTeleprompterTakes(userId);
    return NextResponse.json(
      { takes: takes.map(toTeleprompterTakeSummary) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error_) {
    return teleprompterTakeErrorResponse(error_, '/api/teleprompter/takes');
  }
}

export async function POST(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid-json' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const parsed = SaveTeleprompterTakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid-take' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }
  try {
    const record = await saveTeleprompterTake(userId, parsed.data);
    return NextResponse.json(
      { take: toTeleprompterTakeSummary(record) },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error_) {
    return teleprompterTakeErrorResponse(error_, '/api/teleprompter/takes');
  }
}
