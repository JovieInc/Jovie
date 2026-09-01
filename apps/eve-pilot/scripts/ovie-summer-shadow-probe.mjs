import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'event-id': { type: 'string' },
    'expect-status': { type: 'string', default: '202' },
    message: { type: 'string' },
    unsigned: { type: 'boolean', default: false },
    url: { type: 'string' },
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
const token = process.env.VERCEL_OIDC_TOKEN;
if (!values.unsigned && !token) {
  throw new Error('VERCEL_OIDC_TOKEN is required unless --unsigned is used');
}

const headers = { 'content-type': 'application/json' };
if (!values.unsigned) headers.authorization = `Bearer ${token}`;

const response = await fetch(
  new URL('/ovie/v1/summer-shadow/events', baseUrl),
  {
    method: 'POST',
    headers,
    body: JSON.stringify({
      schema: 'jovie.ovie-summer-shadow.event/v1',
      eventId,
      occurredAt: new Date().toISOString(),
      message:
        values.message ??
        'Acknowledge this signed Ovie-to-Summer shadow binding test only.',
      evidence: [],
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
      request: { eventId, unsigned: values.unsigned },
      response: { status: response.status, body: responseBody },
    },
    null,
    2
  )
);

if (response.status !== expectedStatus) process.exitCode = 1;
