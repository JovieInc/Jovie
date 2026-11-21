import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { checkAppChatPromptContract } from './app-chat-contract';

const baseContext = {
  displayName: 'The Artist',
  username: 'theartist',
  bio: 'Independent alt-pop artist',
  genres: ['alt-pop'],
  spotifyFollowers: 12345,
  spotifyPopularity: 57,
  profileViews: 876,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 10,
    tipsSubmitted: 2,
    totalReceivedCents: 1200,
    monthReceivedCents: 500,
  },
};

describe('deterministic /app/chat prompt contract (ASS-9)', () => {
  it('locks one-rec, truthful grounding, draft-hold, and revenue-first voice', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    const facts = checkAppChatPromptContract(prompt);
    const failed = Object.entries(facts)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    expect(failed).toEqual([]);
  });

  it.each([
    [
      'identifiesPremiumMarketingDept',
      "artist's always-on marketing department",
    ],
    ['requiresRevenueFirstVoice', 'Revenue first'],
    ['requiresOneNextMoveWithReason', 'exactly one next move plus the reason'],
    ['forbidsInventedAccountStats', 'Never invent account stats'],
    ['requiresDraftHoldOutbound', 'Draft every outbound artifact'],
    [
      'keepsGroundingToPromptOrTools',
      'must come from this prompt or from a tool result in this turn',
    ],
  ] as const)('fails when %s needle is removed (%s)', (fact, needle) => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    const sabotaged = prompt.replace(needle, 'REMOVED');
    expect(checkAppChatPromptContract(sabotaged)[fact]).toBe(false);
  });
});
