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

describe('deterministic /app/chat prompt contract (ASS-9 + ASS-16)', () => {
  it('locks one-rec, truthful grounding, draft-hold, revenue-first, and ASS-16 deltas', () => {
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
    ['forbidsPermissionToPlanCloser', 'Never close with permission-to-plan'],
    ['forbidsInventedAccountStats', 'Never invent account stats'],
    ['forbidsInventedAccountFacts', 'Never invent Spotify algorithm'],
    ['forbidsInventedCapabilities', 'smart link is live or will live'],
    ['forbidsInventedCapabilities', "I'll add it"],
    ['requiresDraftHoldOutbound', 'Draft every outbound artifact'],
    ['requiresDraftClearAskNow', 'Never reply with only a promise to draft'],
    ['requiresDraftClearAskNow', 'even when the promise names the release'],
    [
      'requiresRefuseDraftHoldOnlyForUnasked',
      'That refuse→draft-hold line is only for unasked',
    ],
    ['requiresRefuseConcreteNextMove', 'A named promise alone'],
    ['requiresRefuseConcreteNextMove', 'one concrete next move this turn'],
    [
      'keepsGroundingToPromptOrTools',
      'must come from this prompt or from a tool result in this turn',
    ],
    ['requiresUpcomingFirstSentence', 'first content sentence'],
    [
      'requiresDatedMoveOrToolCall',
      'clarifying question is allowed only when a required tool field is truly missing',
    ],
    [
      'requiresVisibleCatalogFacts',
      'Never invent popularity, streams, peer benchmarks',
    ],
    [
      'requiresEmptyProfileSetupNow',
      'Never leave blank artist-facing text on where-to-start',
    ],
    [
      'requiresArtistFacingTextAfterTools',
      'After any tool or useSkill result, always write the artist-facing reply',
    ],
    ['requiresShortDefaultPlans', 'Default advice and launch plans stay short'],
    [
      'requiresRefuseThenDraftHold',
      'refusing an unasked send, post, auto-DM, scrape, or spend',
    ],
    [
      'requiresRefuseThenDraftHold',
      'name the release or artifact from the ask',
    ],
    [
      'requiresRefuseThenDraftHold',
      'Never leave blank artist-facing text on these refuses',
    ],
    [
      'requiresRefusePrivateDataTrain',
      'train on private DMs, demos, or other private data',
    ],
    [
      'requiresRefusePrivateDataTrain',
      'Do not call release-launch, proposeProfileEdit',
    ],
    ['requiresStreamCountNotCatalogDeny', 'cannot see stream counts or saves'],
  ] as const)('fails when %s needle is removed (%s)', (fact, needle) => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    const sabotaged = prompt.replace(needle, 'REMOVED');
    expect(checkAppChatPromptContract(sabotaged)[fact]).toBe(false);
  });
});
