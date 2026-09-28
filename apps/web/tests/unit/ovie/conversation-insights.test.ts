import { describe, expect, it } from 'vitest';
import {
  aggregateStageInsights,
  classifyUserTurns,
  funnelStageForConversation,
  isConversationSampled,
  redactForSignal,
  type SignalRow,
  weekStartUtc,
} from '@/lib/ovie/conversation-insights';

describe('classifyUserTurns', () => {
  it('detects a price objection with intent and drop-off', () => {
    const result = classifyUserTurns([
      'how much does this cost?',
      'honestly it is too expensive for me right now',
    ]);
    expect(result.intent).toBe('pricing');
    expect(result.objectionKey).toBe('too_expensive');
    expect(result.dropOffPoint).toBe('too_expensive');
    expect(result.quote).toBeDefined();
  });

  it('detects competitor usage objections', () => {
    const result = classifyUserTurns(['I already use linktree for my bio']);
    expect(result.objectionKey).toBe('already_have_tool');
  });

  it('flags confusion and bug reports', () => {
    const confused = classifyUserTurns(["i don't understand this page"]);
    expect(confused.confusionOrBug).toBe(true);

    const bug = classifyUserTurns(['the save button is broken']);
    expect(bug.intent).toBe('bug_report');
    expect(bug.confusionOrBug).toBe(true);
  });

  it('captures feature asks', () => {
    const result = classifyUserTurns(['can you add support for bandcamp?']);
    expect(result.featureAsk).toBeDefined();
  });

  it('returns a general intent for unclassified turns', () => {
    const result = classifyUserTurns(['hi', 'ok cool']);
    expect(result.intent).toBe('general');
    expect(result.objectionKey).toBeUndefined();
  });
});

describe('redactForSignal', () => {
  it('strips emails, links, handles, phone numbers, and long digit runs', () => {
    const redacted = redactForSignal(
      'email me at artist@example.com or visit https://x.com/@someone call 415-555-0134 id 12345678'
    );
    expect(redacted).not.toContain('artist@example.com');
    expect(redacted).not.toContain('https://');
    expect(redacted).not.toContain('@someone');
    expect(redacted).not.toContain('415-555-0134');
    expect(redacted).not.toContain('12345678');
    expect(redacted).toContain('[email]');
    expect(redacted).toContain('[link]');
  });

  it('caps quote length', () => {
    expect(redactForSignal('x'.repeat(500)).length).toBeLessThanOrEqual(240);
  });
});

describe('isConversationSampled', () => {
  it('is deterministic for the same id and rate', () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    expect(isConversationSampled(id, 0.5)).toBe(isConversationSampled(id, 0.5));
  });

  it('samples nothing at 0 and everything at 1', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `conv-${i}`);
    expect(ids.filter(id => isConversationSampled(id, 0))).toHaveLength(0);
    expect(ids.filter(id => isConversationSampled(id, 1))).toHaveLength(20);
  });

  it('roughly honors the rate', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `conv-${i}`);
    const sampled = ids.filter(id => isConversationSampled(id, 0.25));
    expect(sampled.length).toBeGreaterThan(10);
    expect(sampled.length).toBeLessThan(120);
  });
});

describe('weekStartUtc', () => {
  it('returns UTC Monday midnight', () => {
    // 2026-09-27 is a Sunday; its week starts Monday 2026-09-21.
    const start = weekStartUtc(new Date('2026-09-27T15:30:00Z'));
    expect(start.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });
});

describe('funnelStageForConversation', () => {
  it('maps anonymous, claimed, and paid owners', () => {
    expect(funnelStageForConversation({ hasUser: false, isPro: false })).toBe(
      'anonymous'
    );
    expect(funnelStageForConversation({ hasUser: true, isPro: false })).toBe(
      'claimed'
    );
    expect(funnelStageForConversation({ hasUser: true, isPro: true })).toBe(
      'paid'
    );
  });
});

describe('aggregateStageInsights', () => {
  const now = new Date('2026-09-27T12:00:00Z'); // week of 2026-09-21
  const thisWeek = weekStartUtc(now);
  const lastWeek = new Date(thisWeek.getTime() - 7 * 86_400_000);

  const row = (overrides: Partial<SignalRow>): SignalRow => ({
    weekStart: thisWeek,
    stage: 'anonymous',
    intent: 'pricing',
    objectionKey: null,
    confusionOrBug: false,
    featureAsk: null,
    dropOffPoint: null,
    ...overrides,
  });

  it('ranks top objections and splits weeks', () => {
    const insights = aggregateStageInsights(
      [
        row({ objectionKey: 'too_expensive' }),
        row({ objectionKey: 'too_expensive' }),
        row({ objectionKey: 'setup_too_hard', confusionOrBug: true }),
        row({ weekStart: lastWeek }),
        row({ stage: 'paid', objectionKey: 'free_tier_enough' }),
      ],
      now
    );
    const anonymous = insights.find(i => i.stage === 'anonymous');
    expect(anonymous?.conversationsThisWeek).toBe(3);
    expect(anonymous?.conversationsLastWeek).toBe(1);
    expect(anonymous?.topObjections[0]).toEqual({
      key: 'too_expensive',
      count: 2,
    });
    expect(anonymous?.confusionCount).toBe(1);

    const paid = insights.find(i => i.stage === 'paid');
    expect(paid?.topObjections[0]?.key).toBe('free_tier_enough');
  });
});
