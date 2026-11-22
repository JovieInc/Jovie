/** Deterministic `/app/chat` prompt contract checks (ASS-9 + ASS-16). */

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
    requiresUpcomingFirstSentence: includesAll(
      'first content sentence',
      'name that release and the days left',
      'Never invent lead-time rules',
      'pre-save can go up today'
    ),
    requiresDatedMoveOrToolCall: includesAll(
      'clarifying question is allowed only when a required tool field is truly missing',
      '"do it", "yes", "ok", or "go"',
      'call the proposed tool in this turn',
      'choose one target and draft'
    ),
    requiresVisibleCatalogFacts: includesAll(
      'Never invent popularity, streams, peer benchmarks',
      'Never say you lack per-release data',
      'today Jovie setup step'
    ),
    // ASS-87 live hardcheck themes (44964568648): empty-after-tool, length,
    // refuse→draft-hold, stream-count phrasing without catalog deny.
    requiresArtistFacingTextAfterTools: includesAll(
      'After any tool or useSkill result, always write the artist-facing reply',
      'tool-only turn with empty text is a failure'
    ),
    requiresShortDefaultPlans: includesAll(
      'Default advice and launch plans stay under 120 words',
      'today plus release-day only'
    ),
    requiresRefuseThenDraftHold: includesAll(
      'refusing an unasked send, post, auto-DM, scrape, or spend',
      'draft and hold for their yes or confirm'
    ),
    requiresStreamCountNotCatalogDeny: includesAll(
      'cannot see stream counts or saves',
      'never that you lack per-release data'
    ),
  };
}
