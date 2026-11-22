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
    forbidsPermissionToPlanCloser: includesAll(
      'Commit the next move in this turn',
      'Never close with permission-to-plan',
      'say the word'
    ),
    forbidsInventedAccountStats: includesAll(
      'Never invent account stats',
      'streams, followers, popularity, saves, playlist adds',
      'say plainly what you cannot see',
      'Never invent the missing figure'
    ),
    forbidsInventedAccountFacts: includesAll(
      'Never invent Spotify algorithm',
      'Do not claim Jovie creates or hosts a DSP pre-save',
      'Never invent CPC',
      'Never invent studio lore'
    ),
    forbidsInventedCapabilities: includesAll(
      'Never invent product features',
      'third-party UI paths',
      'say plainly what you cannot see',
      'Never claim you will set up',
      'smart link is live or will live',
      'lands on Spotify'
    ),
    requiresDraftHoldOutbound: includesAll(
      'Draft every outbound artifact',
      "Hold for the artist's one-tap yes",
      'Never send, post, schedule, pitch live, or spend money'
    ),
    requiresDraftClearAskNow: includesAll(
      'When the artist clearly asks for a draft',
      'draft it now from visible catalog facts',
      'Do not grill for a positioning line'
    ),
    keepsGroundingToPromptOrTools: includesAll(
      'must come from this prompt or from a tool result in this turn',
      'unless it appears above or in a tool result this turn'
    ),
    requiresUpcomingFirstSentence: includesAll(
      'first content sentence',
      'name that release and the days left',
      'Never invent lead-time rules',
      'a release or pre-save link can go on the Jovie profile today'
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
    // ASS-87 / ASS-95: empty-after-tool, length, refuse→draft-hold,
    // stream-count phrasing without catalog deny (44964568648 / 44968636057).
    requiresArtistFacingTextAfterTools: includesAll(
      'After any tool or useSkill result, always write the artist-facing reply',
      'tool-only turn with empty text is a failure'
    ),
    requiresShortDefaultPlans: includesAll(
      'Default advice and launch plans stay short',
      'today plus release-day only'
    ),
    requiresRefuseThenDraftHold: includesAll(
      'refusing an unasked send, post, auto-DM, scrape, or spend',
      'name the release or artifact from the ask',
      'draft and hold for their yes or confirm',
      'Never a generic draft-hold line'
    ),
    // ASS-92 residual safety (44983916780): private-data train refuse before pivot.
    requiresRefusePrivateDataTrain: includesAll(
      'train on private DMs, demos, or other private data',
      'Jovie does not train on creator work',
      'Do not call release-launch'
    ),
    requiresStreamCountNotCatalogDeny: includesAll(
      'cannot see stream counts or saves',
      'Never say you lack per-release data, track-by-track data'
    ),
  };
}
