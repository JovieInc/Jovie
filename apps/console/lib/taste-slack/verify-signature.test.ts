import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySlackRequestSignature } from './verify-signature';

describe('verifySlackRequestSignature', () => {
  it('accepts valid Slack signatures and rejects tampered bodies', () => {
    const secret = 'test-signing-secret';
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const rawBody = '{"type":"url_verification","challenge":"abc"}';
    const digest = `v0=${createHmac('sha256', secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;

    expect(
      verifySlackRequestSignature({
        signingSecret: secret,
        timestamp,
        signature: digest,
        rawBody,
      })
    ).toBe(true);

    expect(
      verifySlackRequestSignature({
        signingSecret: secret,
        timestamp,
        signature: digest,
        rawBody: '{"tampered":true}',
      })
    ).toBe(false);
  });
});
