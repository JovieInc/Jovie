import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supportedAgentDecision } from '@/tests/fixtures/agent-handoff';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  defaultAcquisitionEligibilityDeps: { readCommerceDecision: read },
}));

import { GET } from './route';

describe('agent offer discovery', () => {
  beforeEach(() => {
    vi.stubEnv('ACQUISITION_FIRST_TOUCH_SECRET', 'discovery-test-signing-key');
  });
  it('returns canonical self-serve offer and an uncached supported handoff', async () => {
    read.mockResolvedValue(supportedAgentDecision());
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      price: { amount: 12, currency: 'USD' },
      access: 'Self-serve',
      handoffUrl: expect.stringContaining('agent_intent='),
    });
  });
  it('keeps price discovery available when the matrix owner is unavailable', async () => {
    read.mockRejectedValue(new Error('owner unavailable'));
    expect(await (await GET()).json()).toMatchObject({
      price: { amount: 12 },
      handoffUrl: null,
    });
  });
});
