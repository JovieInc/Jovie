/**
 * Fan-email no-invent + human-send gate. Stolen RULES only
 * (email-newsletter-agent + klaviyo-agent-audit). No Klaviyo MCP, no MJML.
 */

import type {
  FanEmailClaimKey,
  FanEmailDisposition,
  FanEmailDraft,
  FanEmailGateResult,
  FanEmailSendIntent,
  GatedFanEmailCopy,
  GateFanEmailSendInput,
  RetrievedEspMetrics,
  RetrievedSmartLink,
} from './types';

export const FAN_EMAIL_SEND_RULES = `FAN-EMAIL — email-newsletter-agent + klaviyo-agent-audit RULES only. Never fabricate open rate, click rate, list size, slot counts, fake scarcity, or deadline numbers that were not retrieved this run. If the number isn't in hand, don't write it. Missing ESP metrics → unverifiable (omit), not fail. Scored claims need evidence + observed_at. No borrowed testimonials. One CTA. Live smart link only if it actually exists. Do not invent a send. Human-only send: draft or queue-for-approval is ok; never send/schedule/mutate without explicit human sign-off. If fan list size is unknown or 0, skip send. Run still succeeds. No queue.`;

export const UNKNOWN_LIST_SKIP_REASON =
  'Fan list size is unknown. Skip send. No queue.';
export const EMPTY_LIST_SKIP_REASON = 'No fan emails yet. Skip send. No queue.';

const URL_PATTERN = /https?:\/\/[^\s)>\]]+/gi;
const TESTIMONIAL_PATTERN =
  /(?:\u201c[^\u201d]{8,}\u201d|"[^"]{8,}"|\b(testimonial|a fan said|fans? said)\b)/i;
const INVENTED_SEND_PATTERN =
  /\b(just sent|already sent|campaign is live|scheduled (for|to)|sending now|auto-?send)\b/i;
const CLAIM_PATTERNS: ReadonlyArray<{
  readonly key: FanEmailClaimKey;
  readonly re: RegExp;
}> = [
  { key: 'openRate', re: /\b\d+(?:\.\d+)?%\s*open(?:s| rate)?\b/i },
  {
    key: 'clickRate',
    re: /\b\d+(?:\.\d+)?%\s*click(?:s|[- ]through| rate)?\b/i,
  },
  {
    key: 'listSize',
    re: /\b[\d,]+\s*(?:fans?|subscribers?|people on (?:the|your) list)\b/i,
  },
  {
    key: 'scarcity',
    re: /\b(?:only|just|last)\s+\d+\s+(?:spots?|slots?|left|remaining)\b/i,
  },
  {
    key: 'deadline',
    re: /\b(?:ends?|deadline|last chance|expires?)\b[^.]{0,48}/i,
  },
];

function isObservedAt(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && !Number.isNaN(Date.parse(value.trim())));
}

function finiteNum(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function retrievedNumber(
  value: number | null | undefined,
  observedAt: string | null | undefined
): number | undefined {
  return isObservedAt(observedAt) ? finiteNum(value) : undefined;
}

function unverifiableClaims(
  retrieved: RetrievedEspMetrics | null | undefined
): FanEmailClaimKey[] {
  const at = retrieved?.observedAt;
  const missing: FanEmailClaimKey[] = (
    [
      ['openRate', retrievedNumber(retrieved?.openRate, at)],
      ['clickRate', retrievedNumber(retrieved?.clickRate, at)],
      ['listSize', retrievedNumber(retrieved?.listSize, at)],
      ['scarcity', retrievedNumber(retrieved?.scarcityCount, at)],
    ] as const
  )
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);
  if (!isObservedAt(at) || !retrieved?.deadline?.trim())
    missing.push('deadline');
  return missing;
}

function claimedOmits(
  draft: FanEmailDraft | null | undefined,
  retrieved: RetrievedEspMetrics | null | undefined
): FanEmailClaimKey[] {
  const at = retrieved?.observedAt;
  const numeric: Array<
    readonly [FanEmailClaimKey, number | undefined, number | null | undefined]
  > = [
    [
      'openRate',
      retrievedNumber(retrieved?.openRate, at),
      draft?.claimedOpenRate,
    ],
    [
      'clickRate',
      retrievedNumber(retrieved?.clickRate, at),
      draft?.claimedClickRate,
    ],
    [
      'listSize',
      retrievedNumber(retrieved?.listSize, at),
      draft?.claimedListSize,
    ],
  ];
  const omitted = numeric
    .filter(([, actual, claimed]) => claimed != null && actual !== claimed)
    .map(([key]) => key);
  if (draft?.claimedScarcity != null) {
    const scarcity = retrievedNumber(retrieved?.scarcityCount, at);
    const claimed =
      typeof draft.claimedScarcity === 'number'
        ? draft.claimedScarcity
        : Number.parseFloat(
            String(draft.claimedScarcity).replace(/[^\d.]/g, '')
          );
    if (scarcity === undefined || claimed !== scarcity)
      omitted.push('scarcity');
  }
  if (draft?.claimedDeadline != null) {
    const deadline = isObservedAt(at) ? retrieved?.deadline?.trim() : undefined;
    if (
      !deadline ||
      draft.claimedDeadline.trim().toLowerCase() !== deadline.toLowerCase()
    ) {
      omitted.push('deadline');
    }
  }
  return omitted;
}

function collapse(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

function stripUrlsExcept(text: string, keepUrl: string | null): string {
  return text.replace(URL_PATTERN, match => (match === keepUrl ? match : ''));
}

function keepSentences(
  text: string,
  omitted: ReadonlySet<FanEmailClaimKey>
): string {
  return collapse(
    text
      .trim()
      .split(/(?<=[.!?])(?:\s+|$)/)
      .filter(Boolean)
      .filter(
        sentence =>
          !CLAIM_PATTERNS.some(
            pattern => omitted.has(pattern.key) && pattern.re.test(sentence)
          )
      )
      .filter(sentence => !TESTIMONIAL_PATTERN.test(sentence))
      .filter(sentence => !INVENTED_SEND_PATTERN.test(sentence))
      .join(' ')
  );
}

export function sanitizeFanEmailCopy(input: {
  readonly draft?: FanEmailDraft | null;
  readonly retrieved?: RetrievedEspMetrics | null;
  readonly smartLink?: RetrievedSmartLink | null;
}): GatedFanEmailCopy {
  const omitted = [
    ...new Set([
      ...unverifiableClaims(input.retrieved),
      ...claimedOmits(input.draft, input.retrieved),
    ]),
  ];
  const omittedSet = new Set(omitted);
  const ctaUrl =
    input.smartLink?.live === true ? input.smartLink.url?.trim() || null : null;
  const subject = collapse(
    stripUrlsExcept(
      keepSentences(input.draft?.subject ?? '', omittedSet),
      ctaUrl
    )
  );
  let body = collapse(
    stripUrlsExcept(keepSentences(input.draft?.body ?? '', omittedSet), ctaUrl)
  );
  if (ctaUrl && !body.includes(ctaUrl)) body = collapse(`${body} ${ctaUrl}`);
  if (!body)
    body = ctaUrl ? `The release is live. ${ctaUrl}` : 'The release is live.';
  const extras = (body.match(URL_PATTERN) ?? []).filter(url => url !== ctaUrl);
  if (extras.length > 0) body = collapse(stripUrlsExcept(body, ctaUrl));
  const hasCta = Boolean(ctaUrl && body.includes(ctaUrl));
  return {
    subject,
    body,
    ctaUrl: hasCta ? ctaUrl : null,
    ctaCount: hasCta ? 1 : 0,
    omittedClaims: omitted,
  };
}

function resolveDisposition(input: {
  readonly listSize: number | undefined;
  readonly sendIntent: FanEmailSendIntent | null | undefined;
  readonly humanSignOff: boolean;
}): {
  readonly disposition: FanEmailDisposition;
  readonly skipReason: string | null;
  readonly queued: boolean;
} {
  if (input.listSize === undefined) {
    return {
      disposition: 'skip',
      skipReason: UNKNOWN_LIST_SKIP_REASON,
      queued: false,
    };
  }
  if (input.listSize === 0) {
    return {
      disposition: 'skip',
      skipReason: EMPTY_LIST_SKIP_REASON,
      queued: false,
    };
  }
  const intent = input.sendIntent ?? 'draft';
  const canQueue =
    intent === 'queue_for_approval' ||
    (input.humanSignOff && (intent === 'auto_send' || intent === 'schedule'));
  return canQueue
    ? { disposition: 'queue_for_approval', skipReason: null, queued: true }
    : { disposition: 'draft', skipReason: null, queued: false };
}

/** Hard no-invent + human-send gate. The tool never sends or schedules. */
export function gateFanEmailSend(
  input: GateFanEmailSendInput = {}
): FanEmailGateResult {
  const { disposition, skipReason, queued } = resolveDisposition({
    listSize: retrievedNumber(
      input.retrieved?.listSize,
      input.retrieved?.observedAt
    ),
    sendIntent: input.sendIntent,
    humanSignOff: input.humanSignOff === true,
  });
  return {
    disposition,
    skipReason,
    runSucceeded: true,
    queued,
    sent: false,
    scheduled: false,
    copy: sanitizeFanEmailCopy(input),
    unverifiable: unverifiableClaims(input.retrieved),
  };
}
