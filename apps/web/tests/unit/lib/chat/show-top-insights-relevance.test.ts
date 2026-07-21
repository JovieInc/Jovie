import { describe, expect, it } from 'vitest';
import { isShowTopInsightsTurnRelevant } from '@/lib/chat/show-top-insights-relevance';

describe('isShowTopInsightsTurnRelevant', () => {
  it('allows performance and growth questions', () => {
    expect(
      isShowTopInsightsTurnRelevant('What audience growth signals matter?')
    ).toBe(true);
    expect(isShowTopInsightsTurnRelevant('How are my subscribers doing?')).toBe(
      true
    );
    expect(isShowTopInsightsTurnRelevant('What should I focus on next?')).toBe(
      true
    );
    expect(isShowTopInsightsTurnRelevant('Show me my top signals')).toBe(true);
  });

  it('blocks unrelated turns like distribution and bio edits', () => {
    expect(
      isShowTopInsightsTurnRelevant('Should I sign with AWAL for distribution?')
    ).toBe(false);
    expect(isShowTopInsightsTurnRelevant('Help me write a bio')).toBe(false);
    expect(
      isShowTopInsightsTurnRelevant('Can you generate album art for my single?')
    ).toBe(false);
  });

  it('still allows signal questions that mention an unrelated vendor', () => {
    expect(
      isShowTopInsightsTurnRelevant(
        'How is my audience growth looking after the AWAL distribution push?'
      )
    ).toBe(true);
  });

  it('defaults closed for empty or generic turns', () => {
    expect(isShowTopInsightsTurnRelevant('')).toBe(false);
    expect(isShowTopInsightsTurnRelevant('   ')).toBe(false);
    expect(isShowTopInsightsTurnRelevant('thanks')).toBe(false);
  });
});
