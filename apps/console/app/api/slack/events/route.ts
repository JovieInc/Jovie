import { NextResponse } from 'next/server';
import {
  handleTasteSlackReaction,
  type SlackReactionAddedEvent,
} from '@/lib/taste-slack/reaction-handler';
import { verifySlackRequestSignature } from '@/lib/taste-slack/verify-signature';

export const runtime = 'nodejs';

interface SlackUrlVerificationPayload {
  readonly type: 'url_verification';
  readonly challenge: string;
}

interface SlackEventCallbackPayload {
  readonly type: 'event_callback';
  readonly event: SlackReactionAddedEvent;
}

type SlackEventsPayload =
  | SlackUrlVerificationPayload
  | SlackEventCallbackPayload;

export async function POST(request: Request): Promise<Response> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return NextResponse.json(
      { error: 'SLACK_SIGNING_SECRET not configured' },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
  const signature = request.headers.get('x-slack-signature') ?? '';

  if (
    !verifySlackRequestSignature({
      signingSecret,
      timestamp,
      signature,
      rawBody,
    })
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: SlackEventsPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventsPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== 'event_callback') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await handleTasteSlackReaction(payload.event);
  return NextResponse.json({ ok: true, result });
}
