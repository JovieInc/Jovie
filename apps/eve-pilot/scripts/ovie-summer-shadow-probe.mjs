import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    capability: { type: 'string' },
    'conversation-id': { type: 'string' },
    'daily-slot': { type: 'string', default: '1' },
    'event-id': { type: 'string' },
    'expect-status': { type: 'string', default: '202' },
    'inspect-session': { type: 'string' },
    'max-events': { type: 'string' },
    message: { type: 'string' },
    'start-index': { type: 'string', default: '0' },
    turn: { type: 'string', default: '1' },
    unsigned: { type: 'boolean', default: false },
    url: { type: 'string' },
    'via-ovie': { type: 'boolean', default: false },
  },
  strict: true,
});

const baseUrl = values.url ?? process.env.EVE_SHADOW_URL;
if (!baseUrl) throw new Error('Pass --url or set EVE_SHADOW_URL');

const expectedStatus = Number(values['expect-status']);
if (!Number.isInteger(expectedStatus)) {
  throw new Error('--expect-status must be an integer');
}

const eventId = values['event-id'] ?? `evt_${randomUUID().replaceAll('-', '')}`;
const conversationId = values['conversation-id'] ?? eventId;
const turn = Number(values.turn);
const dailySlot = Number(values['daily-slot']);
const startIndex = Number(values['start-index']);
const maxEvents = values['max-events']
  ? Number(values['max-events'])
  : undefined;
const token = values['via-ovie']
  ? process.env.CRON_SECRET
  : process.env.VERCEL_OIDC_TOKEN;
if (!values.unsigned && !token) {
  throw new Error(
    `${values['via-ovie'] ? 'CRON_SECRET' : 'VERCEL_OIDC_TOKEN'} is required unless --unsigned is used`
  );
}

const headers = { 'content-type': 'application/json' };
if (!values.unsigned) headers.authorization = `Bearer ${token}`;

if (values['inspect-session']) {
  if (!values['conversation-id']) {
    throw new Error('--conversation-id is required with --inspect-session');
  }
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
    throw new Error('--start-index must be a non-negative integer');
  }
  if (
    maxEvents !== undefined &&
    (!Number.isSafeInteger(maxEvents) || maxEvents < 1)
  ) {
    throw new Error('--max-events must be a positive integer');
  }

  const streamUrl = values['via-ovie']
    ? new URL('/api/internal/ovie/summer-shadow', baseUrl)
    : new URL(
        `/ovie/v1/summer-shadow/sessions/${encodeURIComponent(values['inspect-session'])}/stream`,
        baseUrl
      );
  if (values['via-ovie']) {
    streamUrl.searchParams.set('sessionId', values['inspect-session']);
  }
  streamUrl.searchParams.set('conversationId', values['conversation-id']);
  streamUrl.searchParams.set('startIndex', String(startIndex));

  const streamResponse = await fetch(streamUrl, { headers });
  if (!streamResponse.ok || !streamResponse.body) {
    throw new Error(`stream request failed with ${streamResponse.status}`);
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffered = '';
  while (maxEvents === undefined || events.length < maxEvents) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    while (buffered.includes('\n')) {
      const newline = buffered.indexOf('\n');
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      events.push(JSON.parse(line));
      if (maxEvents !== undefined && events.length >= maxEvents) break;
    }
  }
  await reader.cancel().catch(() => {});

  const summaries = events.map(event => ({
    type: event.type,
    eventId: event.meta?.id,
    turnId: event.data?.turnId,
    ...(event.type === 'actions.requested'
      ? {
          actions: event.data?.actions?.map(action => ({
            callId: action.callId,
            toolName: action.toolName,
          })),
        }
      : {}),
    ...(event.type === 'action.result'
      ? {
          action: {
            callId: event.data?.callId,
            toolName: event.data?.toolName,
            output: event.data?.output,
            status: event.data?.status,
          },
        }
      : {}),
    ...(event.type === 'message.completed'
      ? { message: String(event.data?.message ?? '').slice(0, 500) }
      : {}),
  }));

  console.log(
    JSON.stringify(
      {
        request: {
          sessionId: values['inspect-session'],
          startIndex,
        },
        response: {
          eventCount: events.length,
          nextStartIndex: startIndex + events.length,
          events: summaries,
        },
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(dailySlot)) {
  throw new Error('--turn and --daily-slot must be integers');
}

const response = await fetch(
  new URL(
    values['via-ovie']
      ? '/api/internal/ovie/summer-shadow'
      : '/ovie/v1/summer-shadow/events',
    baseUrl
  ),
  {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(values['via-ovie']
        ? {}
        : { schema: 'jovie.ovie-summer-shadow.event/v1' }),
      eventId,
      conversationId,
      turn,
      dailySlot,
      ...(values['via-ovie'] ? {} : { occurredAt: new Date().toISOString() }),
      message:
        values.message ??
        'Acknowledge this signed Ovie-to-Summer shadow binding test only.',
      evidence: [],
      ...(values.capability ? { requestedCapability: values.capability } : {}),
    }),
  }
);

const responseText = await response.text();
let responseBody;
try {
  responseBody = JSON.parse(responseText);
} catch {
  responseBody = { raw: responseText.slice(0, 500) };
}

console.log(
  JSON.stringify(
    {
      request: {
        eventId,
        conversationId,
        turn,
        dailySlot,
        unsigned: values.unsigned,
      },
      response: { status: response.status, body: responseBody },
    },
    null,
    2
  )
);

if (response.status !== expectedStatus) process.exitCode = 1;
