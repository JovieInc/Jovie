import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './route';

function signedRequest(body: string, secret: string): Request {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const signature = `v0=${createHmac('sha256', secret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`;

  return new Request('http://localhost:3003/api/slack/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body,
  });
}

describe('POST /api/slack/events', () => {
  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it('returns the url_verification challenge for signed payloads', async () => {
    process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
    const body = JSON.stringify({
      type: 'url_verification',
      challenge: 'challenge-token',
    });

    const response = await POST(signedRequest(body, 'test-signing-secret'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      challenge: 'challenge-token',
    });
  });
});
