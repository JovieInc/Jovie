import { describe, expect, it } from 'vitest';
import {
  evaluateAllFanEmailRuleCases,
  evaluateFanEmailRuleCase,
  FAN_EMAIL_RULE_CASE_IDS,
  FAN_EMAIL_SEND_RULES,
  gateFanEmailSend,
} from '@/lib/email/campaigns/fan-email-rules';

describe('fan email no-invent + human-send gate', () => {
  it('encodes fan-email rule cases', () => {
    for (const result of evaluateAllFanEmailRuleCases()) {
      expect(result.passed, result.reason).toBe(true);
    }
    for (const id of FAN_EMAIL_RULE_CASE_IDS) {
      expect(evaluateFanEmailRuleCase(id).passed, id).toBe(true);
    }
  });

  it('skips unknown list size without queueing a send', () => {
    const gated = gateFanEmailSend({
      retrieved: { listSize: null, openRate: null },
      proposed: {
        listSize: 10_000,
        openRate: 0.51,
        send: true,
        testimonials: ['Rolling Stone loves this'],
      },
    });

    expect(gated.disposition).toBe('skip');
    expect(gated.send).toBe(false);
    expect(gated.queued).toBe(false);
    expect(gated.runSucceeded).toBe(true);
    expect(gated.metrics.listSize).toBeUndefined();
    expect(gated.metrics.openRateStatus).toBe('unverifiable');
    expect(JSON.stringify(gated)).not.toContain('10000');
    expect(FAN_EMAIL_SEND_RULES).toContain('unverifiable');
    expect(FAN_EMAIL_SEND_RULES).toContain('auto-send is not');
    expect(FAN_EMAIL_SEND_RULES).toContain('No borrowed testimonials');
  });

  it('queues for approval when the list is known but no human signed off', () => {
    const gated = gateFanEmailSend({
      retrieved: {
        listSize: 42,
        liveSmartLinkUrl: 'https://jov.ie/tim/never-say-a-word',
      },
      proposed: {
        send: true,
        ctas: [
          { url: 'https://jov.ie/tim/never-say-a-word' },
          { url: 'https://example.com/other' },
        ],
      },
    });

    expect(gated.send).toBe(false);
    expect(gated.queued).toBe(true);
    expect(gated.disposition).toBe('queue_for_approval');
    expect(gated.cta?.url).toBe('https://jov.ie/tim/never-say-a-word');
    expect(gated.omittedInvented).toContain('cta');
    expect(gated.omittedInvented).toContain('send');
  });
});
