import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { detectBot } from './bot-detection';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function request(headers: Record<string, string>) {
  return new NextRequest('https://jov.ie/api/track', { headers });
}

describe('detectBot self-declared synthetic traffic (JOV-9822)', () => {
  it('classifies a probe that sends the synthetic header as a bot without blocking it', () => {
    const result = detectBot(
      request({
        'user-agent': BROWSER_UA,
        'x-synthetic-monitoring': 'prod-cert',
      }),
      '/api/track'
    );
    expect(result).toMatchObject({
      isBot: true,
      shouldBlock: false,
      reason: 'self_declared_synthetic',
    });
  });

  it('leaves an ordinary browser visit unclassified', () => {
    const result = detectBot(
      request({ 'user-agent': BROWSER_UA }),
      '/api/track'
    );
    expect(result.isBot).toBe(false);
  });
});
