import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { jovieCoreChatAuth } from '../agent/channels/eve';

describe('Eve channel auth contract', () => {
  const originalToken = process.env.EVE_CORE_CHAT_AUTH_TOKEN;

  beforeEach(() => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'test-route-token';
  });

  afterEach(() => {
    if (originalToken === undefined)
      delete process.env.EVE_CORE_CHAT_AUTH_TOKEN;
    else process.env.EVE_CORE_CHAT_AUTH_TOKEN = originalToken;
  });

  it('accepts the configured bearer and returns a read-only app principal', async () => {
    const result = await jovieCoreChatAuth(
      new Request('https://eve.example.com/eve/v1/session', {
        headers: { authorization: 'Bearer test-route-token' },
      })
    );

    expect(result).toMatchObject({
      authenticator: 'jovie-core-chat-token',
      principalId: 'jovie-core-chat',
      principalType: 'app',
      attributes: { readOnly: 'true', source: 'jovie-core-chat' },
    });
  });

  it('fails closed for missing or incorrect credentials', async () => {
    expect(
      jovieCoreChatAuth(new Request('https://eve.example.com/eve/v1/session'))
    ).toBeNull();
    expect(
      jovieCoreChatAuth(
        new Request('https://eve.example.com/eve/v1/session', {
          headers: { authorization: 'Bearer wrong-token' },
        })
      )
    ).toBeNull();
  });
});
