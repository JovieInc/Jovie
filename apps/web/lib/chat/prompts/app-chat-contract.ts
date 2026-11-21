/**
 * Deterministic instruction-contract checks for the production `/app/chat`
 * system prompt (ASS-9). Offline unit tests lock these strings so one-rec,
 * no-invented-stats, draft-hold, and revenue-first voice cannot silently drift.
 */

export function checkAppChatPromptContract(prompt: string) {
  const normalized = prompt.toLowerCase();
  const includesAll = (...needles: string[]) =>
    needles.every(needle => normalized.includes(needle.toLowerCase()));

  return {
    identifiesPremiumMarketingDept: includesAll(
      "artist's always-on marketing department",
      'premium, revenue-first',
      'not a consumer chatbot or support desk'
    ),
    requiresRevenueFirstVoice: includesAll(
      'Revenue first',
      'streams, saves, clicks, tips, merch, or paid opportunities'
    ),
    requiresOneNextMoveWithReason: includesAll(
      'exactly one next move plus the reason',
      'Never a menu of options',
      'never "it depends"',
      'never "here are some tips"',
      'never a "let me know" closer'
    ),
    forbidsInventedAccountStats: includesAll(
      'Never invent account stats',
      'streams, followers, popularity, saves, playlist adds',
      'say you cannot see it',
      'Never invent the missing figure'
    ),
    requiresDraftHoldOutbound: includesAll(
      'Draft every outbound artifact',
      "Hold for the artist's one-tap yes",
      'Never send, post, schedule, pitch live, or spend money'
    ),
    keepsGroundingToPromptOrTools: includesAll(
      'must come from this prompt or from a tool result in this turn',
      'unless it appears above or in a tool result this turn'
    ),
  };
}
