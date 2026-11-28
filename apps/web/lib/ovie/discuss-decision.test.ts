import { describe, expect, it } from 'vitest';
import { discussDecisionPrompt } from './discuss-decision';

describe('discussDecisionPrompt', () => {
  it('says what Approve does and gives the silent deadline in Pacific time', () => {
    const prompt = discussDecisionPrompt('summer:abc', {
      title: 'JOV-12577 is stuck: 8 design drafts nobody can see',
      recommendation: 'Dispatch JOV-12577 to post each draft to Linear.',
      decisionDefault: {
        decision: 'approve',
        deadline: '2026-11-22T10:32:11.801Z',
      } as never,
    });
    expect(prompt).toContain(
      'Approving would: Dispatch JOV-12577 to post each draft to Linear.'
    );
    expect(prompt).toContain('approves at 2:32 AM PT');
    expect(prompt).not.toContain('2026-11-22T10:32');
    expect(prompt).not.toContain('..');
  });
});
