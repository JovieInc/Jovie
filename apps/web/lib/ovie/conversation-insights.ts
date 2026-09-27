import { createHash } from 'node:crypto';

/**
 * Conversation insights pipeline (JOV-6784).
 *
 * Pure functions: deterministic sampling, the cheapest viable rule-based
 * classifier, PII redaction, and week-over-week aggregation. No database or
 * network access — the server pipeline in `conversation-insights.server.ts`
 * feeds rows in and persists results.
 */

export const FUNNEL_STAGES = ['anonymous', 'claimed', 'paid'] as const;
export type ConversationFunnelStage = (typeof FUNNEL_STAGES)[number];

export const OBJECTION_SOURCES = ['chat', 'call', 'email'] as const;
export type ObjectionSource = (typeof OBJECTION_SOURCES)[number];

export const OBJECTION_STATUSES = [
  'draft',
  'approved',
  'published',
  'rejected',
] as const;
export type ObjectionStatus = (typeof OBJECTION_STATUSES)[number];

const MAX_QUOTE_LENGTH = 240;

/**
 * Objection catalog: stable key, display label, classifier patterns, and the
 * system's drafted answer. Drafted answers are deterministic templates — the
 * first of each type is approved via an Inbox card before publication.
 */
export const OBJECTION_CATALOG: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly patterns: readonly RegExp[];
  readonly draftedAnswer: string;
}> = [
  {
    key: 'too_expensive',
    label: 'Price is too high',
    patterns: [
      /\b(too (expensive|much|pricey)|costs? too much|can'?t afford|pricey)\b/i,
      /\b(cheaper|discount|coupon|promo code)\b/i,
    ],
    draftedAnswer:
      'Jovie Pro is priced below a single hour of a social-media manager. Most creators earn it back with one release cycle of better fan capture.',
  },
  {
    key: 'free_tier_enough',
    label: 'Free tier is enough',
    patterns: [
      /\b(free (tier|plan|version) is (fine|enough)|stay(ing)? (on )?free|why pay)\b/i,
      /\b(do i (really )?need pro|is pro worth)\b/i,
    ],
    draftedAnswer:
      'Free covers a live page. Pro adds the things that convert fans: custom domain, release automations, and fan-contact capture.',
  },
  {
    key: 'doesnt_support_platform',
    label: 'Missing platform or integration support',
    patterns: [
      /\b(support|integrat\w+|connect)\w*\s+(spotify|apple|youtube|tiktok|instagram|bandcamp|soundcloud)\b/i,
      /\b(doesn'?t|does not|no)\s+(support|work with|integrate)\b/i,
    ],
    draftedAnswer:
      'Jovie syncs Spotify, Apple Music, and YouTube natively, and any other link can be added manually in seconds.',
  },
  {
    key: 'already_have_tool',
    label: 'Already uses a competing tool',
    patterns: [
      /\b(already (have|use|using)|i use)\b.*\b(linktree|beacons|koji|linkfire|feature\.fm|hypeddit|squarespace|wix|bandzoogle)\b/i,
      /\b(switch|migrate|move) (from|over)\b/i,
    ],
    draftedAnswer:
      'Jovie imports your existing links in one step and adds music-specific features general link tools do not have, like release radar and fan messaging.',
  },
  {
    key: 'setup_too_hard',
    label: 'Setup seems too complicated',
    patterns: [
      /\b(too (hard|complicated|complex|confusing)|don'?t understand|no idea how|how do i (set|start|use))\b/i,
      /\b(stuck|confused|lost)\b/i,
    ],
    draftedAnswer:
      'Setup is a single claim link and one Spotify connect — the chat walks it step by step, and most pages go live in under five minutes.',
  },
  {
    key: 'privacy_data_concern',
    label: 'Concerned about data or privacy',
    patterns: [
      /\b(privacy|data (use|sold|sharing)|track(ing)? me|gdpr|delete my (data|account))\b/i,
    ],
    draftedAnswer:
      'Jovie never sells fan or creator data. Everything collected is visible in settings and exportable or deletable on request.',
  },
];

export const INTENT_CATALOG: ReadonlyArray<{
  readonly key: string;
  readonly patterns: readonly RegExp[];
}> = [
  {
    key: 'claim_profile',
    patterns: [
      /\b(claim|verify|is this (me|my)|that'?s my (name|page|profile))\b/i,
    ],
  },
  {
    key: 'pricing',
    patterns: [
      /\b(pricing|price|cost|how much|plan|subscription|upgrade|pro)\b/i,
    ],
  },
  {
    key: 'setup_help',
    patterns: [
      /\b(how do i|set ?up|connect|add (a |my )?link|customize|edit my)\b/i,
    ],
  },
  {
    key: 'feature_question',
    patterns: [/\b(can (it|you|jovie)|does (it|jovie)|is there)\b/i],
  },
  {
    key: 'billing_problem',
    patterns: [/\b(charged|charge|refund|cancel|billing|invoice|payment)\b/i],
  },
  {
    key: 'bug_report',
    patterns: [
      /\b(broken|bug|error|doesn'?t work|not working|won'?t load|crash|glitch)\b/i,
    ],
  },
];

const FEATURE_ASK_PATTERN =
  /\b(can you add|please add|wish (it|you)|would be (nice|great)|feature request|support for|any plans? (to|for))\b/i;

const CONFUSION_PATTERN =
  /\b(confused|confusing|don'?t (get|understand)|makes no sense|what does this mean|huh\??)\b/i;

export type ConversationClassification = {
  readonly intent: string;
  readonly objectionKey?: string;
  readonly objectionLabel?: string;
  readonly confusionOrBug: boolean;
  readonly featureAsk?: string;
  readonly dropOffPoint?: string;
  readonly quote?: string;
};

/**
 * Classify one conversation from its user-turn texts. Deterministic; the last
 * matching objection/intent wins recency, and the drop-off point is the tag of
 * the final user turn.
 */
export function classifyUserTurns(
  userTurns: readonly string[]
): ConversationClassification {
  let intent = 'general';
  let objection: (typeof OBJECTION_CATALOG)[number] | undefined;
  let featureAsk: string | undefined;
  let confusionOrBug = false;
  let quote: string | undefined;
  let dropOffPoint: string | undefined;

  for (const raw of userTurns) {
    const text = raw.trim();
    if (!text) continue;

    for (const candidate of INTENT_CATALOG) {
      if (candidate.patterns.some(pattern => pattern.test(text))) {
        intent = candidate.key;
      }
    }

    const hit = OBJECTION_CATALOG.find(candidate =>
      candidate.patterns.some(pattern => pattern.test(text))
    );
    if (hit) {
      objection = hit;
      quote = quote ?? text;
    }

    if (CONFUSION_PATTERN.test(text) || intent === 'bug_report') {
      confusionOrBug = true;
      quote = quote ?? text;
    }

    if (FEATURE_ASK_PATTERN.test(text)) {
      featureAsk = intent === 'general' ? 'general_ask' : intent;
      quote = quote ?? text;
    }

    dropOffPoint = hit?.key ?? intent;
  }

  return {
    intent,
    ...(objection
      ? { objectionKey: objection.key, objectionLabel: objection.label }
      : {}),
    confusionOrBug,
    ...(featureAsk ? { featureAsk } : {}),
    ...(dropOffPoint ? { dropOffPoint } : {}),
    ...(quote ? { quote: redactForSignal(quote) } : {}),
  };
}

/** Map a conversation's owner state onto the funnel stage enum. */
export function funnelStageForConversation(input: {
  readonly hasUser: boolean;
  readonly isPro: boolean;
}): ConversationFunnelStage {
  if (input.isPro) return 'paid';
  return input.hasUser ? 'claimed' : 'anonymous';
}

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/g;
const HANDLE_PATTERN = /(?<=\s|^)@[\w.]+/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const LONG_DIGIT_RUN = /\b\d{4,}\b/g;
const WHITESPACE = /\s+/g;

/**
 * Strip PII-shaped content from a quote: emails, URLs, @handles, phone
 * numbers, and long digit runs. Output is capped and safe to store.
 */
export function redactForSignal(text: string): string {
  const cleaned = text
    .replace(EMAIL_PATTERN, '[email]')
    .replace(URL_PATTERN, '[link]')
    .replace(HANDLE_PATTERN, '[handle]')
    .replace(PHONE_PATTERN, '[number]')
    .replace(LONG_DIGIT_RUN, '[number]')
    .replace(WHITESPACE, ' ')
    .trim();
  return cleaned.length > MAX_QUOTE_LENGTH
    ? `${cleaned.slice(0, MAX_QUOTE_LENGTH - 1)}…`
    : cleaned;
}

/**
 * Deterministic sampling: stable across re-runs because it hashes the
 * conversation id, not the row order. `rate` is 0..1.
 */
export function isConversationSampled(
  conversationId: string,
  rate: number
): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  const digest = createHash('sha256').update(conversationId).digest();
  const bucket = digest.readUInt32BE(0) % 10_000;
  return bucket < Math.floor(rate * 10_000);
}

/** UTC midnight of the Monday starting the ISO week containing `date`. */
export function weekStartUtc(date: Date): Date {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - weekday);
  return day;
}

export type SignalRow = {
  readonly weekStart: Date;
  readonly stage: ConversationFunnelStage;
  readonly intent: string;
  readonly objectionKey: string | null;
  readonly confusionOrBug: boolean;
  readonly featureAsk: string | null;
  readonly dropOffPoint: string | null;
};

export type StageInsight = {
  readonly stage: ConversationFunnelStage;
  readonly conversationsThisWeek: number;
  readonly conversationsLastWeek: number;
  readonly topObjections: readonly { key: string; count: number }[];
  readonly topAsks: readonly { ask: string; count: number }[];
  readonly confusionCount: number;
  readonly topDropOffPoints: readonly { point: string; count: number }[];
};

function topCounts(
  values: Iterable<string | null | undefined>,
  limit: number
): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

/**
 * Aggregate signal rows into per-stage insights with week-over-week counts,
 * ranked by frequency so Summer can rank work by conversion impact.
 */
export function aggregateStageInsights(
  signals: readonly SignalRow[],
  now: Date
): StageInsight[] {
  const currentWeek = weekStartUtc(now).getTime();
  const previousWeek = currentWeek - 7 * 86_400_000;

  return FUNNEL_STAGES.map(stage => {
    const rows = signals.filter(row => row.stage === stage);
    const thisWeek = rows.filter(
      row => row.weekStart.getTime() === currentWeek
    );
    const lastWeek = rows.filter(
      row => row.weekStart.getTime() === previousWeek
    );
    return {
      stage,
      conversationsThisWeek: thisWeek.length,
      conversationsLastWeek: lastWeek.length,
      topObjections: topCounts(
        thisWeek.map(row => row.objectionKey),
        5
      ).map(([key, count]) => ({ key, count })),
      topAsks: topCounts(
        thisWeek.map(row => row.featureAsk),
        5
      ).map(([ask, count]) => ({ ask, count })),
      confusionCount: thisWeek.filter(row => row.confusionOrBug).length,
      topDropOffPoints: topCounts(
        thisWeek.map(row => row.dropOffPoint),
        5
      ).map(([point, count]) => ({ point, count })),
    };
  });
}
