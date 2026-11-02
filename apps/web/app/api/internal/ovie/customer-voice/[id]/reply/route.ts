import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  customerReplySchema,
  sendApprovedCustomerReply,
} from '@/lib/customer-voice/reply.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * Summer sends one reply Tim approved by iMessage (customer voice loop).
 * The recipient is always the item's original sender; Summer supplies only
 * the approved text and its hash.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return json({ error: 'invalid_id' }, 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const input = customerReplySchema.safeParse(body);
  if (!input.success) return json({ error: 'invalid_body' }, 400);

  try {
    const result = await sendApprovedCustomerReply(id, input.data);
    if (result.status === 'sent') {
      return json({ status: 'sent', sentAt: result.sentAt }, 200);
    }
    return json({ error: result.code }, result.httpStatus);
  } catch (error) {
    await captureError('Customer voice reply failed', error, {
      route: '/api/internal/ovie/customer-voice/[id]/reply',
    });
    return json({ error: 'reply_unavailable' }, 503);
  }
}
