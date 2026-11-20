/**
 * Customer voice classifier (pure, deterministic, no model).
 *
 * Two questions about one customer message:
 * 1. Is it urgent? Bugs, billing or payment, anger, public or legal language.
 *    Urgent items are always pushed to Tim right away.
 * 2. Is a chat turn feedback at all? Most chat turns are product use ("make me
 *    a bio link"). Feedback is a complaint, price pushback, confusion, a bug, a
 *    feature ask or a direct note to the team. This is deliberately broader
 *    than OBJECTION_CATALOG in lib/ovie/conversation-insights.ts: that catalog
 *    missed "12usd a month? Wow. A lot?" and "the preview is just my name and
 *    a photo", the two complaints that started this loop (2026-10-31).
 *
 * Email, feedback-form and waitlist-reply messages are always customer voice;
 * only chat turns go through `isFeedbackTurn`.
 */

export const URGENT_REASONS = [
  'bug',
  'billing',
  'angry',
  'public',
  'legal',
] as const;
export type UrgentReason = (typeof URGENT_REASONS)[number];

const URGENT_PATTERNS: Readonly<Record<UrgentReason, readonly RegExp[]>> = {
  bug: [
    /\b(bug|broken|crash(?:ed|es|ing)?|error|doesn'?t work|does not work|not working|won'?t (?:load|work|open|let me)|can'?t (?:log ?in|sign ?in|access|load|see my)|stuck on|blank (?:page|screen)|500|404)\b/i,
  ],
  billing: [
    /\b(charged?|charging|refund|chargeback|invoice|billing|payment|card (?:was )?declined|double[- ]charged|cancel (?:my )?(?:subscription|plan)|subscription|overcharged|money back)\b/i,
  ],
  angry: [
    /\b(wtf|scam|ripoff|rip[- ]off|ridiculous|unacceptable|terrible|awful|worst|furious|pissed|disgusting|useless|garbage|fraud)\b/i,
    /!{3,}/,
  ],
  public: [
    /\b(twitter|tweet|x\.com|reddit|trustpilot|review(?:ed)? (?:you|this|jovie)|post(?:ing)? about|tell everyone|press|journalist|reporter|tiktok about)\b/i,
  ],
  legal: [
    /\b(lawyer|attorney|legal action|sue|suing|lawsuit|gdpr|ccpa|dmca|copyright|trademark|delete my (?:data|account)|data request|privacy violation|cease and desist|small claims)\b/i,
  ],
};

export function urgentReasons(text: string): UrgentReason[] {
  const reasons: UrgentReason[] = [];
  for (const reason of URGENT_REASONS) {
    if (URGENT_PATTERNS[reason].some(pattern => pattern.test(text))) {
      reasons.push(reason);
    }
  }
  return reasons;
}

/** Feedback-shaped chat turns. Product requests ("add my Spotify") are not. */
const FEEDBACK_PATTERNS: readonly RegExp[] = [
  // Price and value pushback, including the soft forms real people use.
  /\b(too (?:expensive|much|pricey)|a lot (?:of money|for)?|pricey|costs? too much|can'?t afford|not worth|why (?:would i |should i )?pay|cheaper|discount)\b/i,
  /(?:\$|usd|€|£)\s?\d+|\d+\s?(?:usd|dollars|bucks|\/mo|a month|per month)/i,
  /\b(try (?:it )?(?:first|before)|free trial|before i pay|see how it works|have a look first)\b/i,
  // Thin value, confusion, disappointment.
  /\b(just my name|only (?:shows|has) my|preview (?:is|was)|not (?:illuminating|helpful|clear|useful)|doesn'?t (?:show|do) (?:much|anything)|what (?:does|is) (?:this|jovie) (?:do|for)|confus(?:ed|ing)|don'?t (?:get|understand)|makes no sense|disappoint\w*|expected more|underwhelm\w*)\b/i,
  // Wow-as-shock and similar reactions at the start of a turn.
  /^\s*(?:wow|hmm+|ugh|meh|huh)\b[\s\S]*\?/i,
  // Bug-ish and asks to the team.
  /\b(bug|broken|not working|doesn'?t work|error|glitch|weird)\b/i,
  /\b(feature request|would be (?:nice|great|cool) if|please add|you should add|wish (?:it|you|jovie))\b/i,
  /\b(feedback|suggestion|complain\w*|support|talk to (?:a |someone|a human|the team|tim)|who (?:runs|made) this)\b/i,
];

export function isFeedbackTurn(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8 || trimmed.length > 4000) return false;
  if (urgentReasons(trimmed).length) return true;
  return FEEDBACK_PATTERNS.some(pattern => pattern.test(trimmed));
}

/** Mail we should never ping Tim about: bounces, auto-replies, bulk lists. */
export function isAutomatedEmail(input: {
  readonly from: string;
  readonly subject?: string | null;
  readonly headers?: Readonly<Record<string, string>> | null;
}): boolean {
  const from = input.from.toLowerCase();
  if (
    /(?:^|[<\s])(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[s]?|notifications?)@/.test(
      from
    )
  ) {
    return true;
  }
  const headers = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      String(value).toLowerCase(),
    ])
  );
  if (headers['auto-submitted'] && headers['auto-submitted'] !== 'no') {
    return true;
  }
  if (headers['list-unsubscribe'] || headers['list-id']) return true;
  if (/^(?:bulk|list|junk|auto_reply)$/.test(headers.precedence ?? '')) {
    return true;
  }
  return /^(?:auto(?:matic)? ?reply|out of (?:the )?office|undeliverable|delivery status notification)/i.test(
    input.subject ?? ''
  );
}
