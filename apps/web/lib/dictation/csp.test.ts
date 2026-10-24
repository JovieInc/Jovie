import { expect, it } from 'vitest';
import { getCspConnectSrcDomains } from '@/constants/platforms/cdn-domains';

it('allows only the exact registered ElevenLabs WebSocket origin, preserving same-origin token requests', () => {
  const domains = getCspConnectSrcDomains();
  expect(domains).toContain('wss://api.elevenlabs.io');
  expect(domains).not.toContain('wss:');
  expect(domains).not.toContain('*');
});
