/**
 * LLM output guard for offer claims. Anything a model writes that states a
 * price, trial, billing, renewal, cancellation, refund, guarantee or discount
 * must match the canonical offer; a sentence that does not is replaced with
 * the deterministic offer line. In strict (kill-switch) mode every sentence
 * that touches money is replaced, so only registered templates reach users.
 */

import { claims, forbiddenShapeViolations } from './claims';
import { OFFER, type Offer } from './offer';
import {
  wrongPlanAmounts,
  wrongRecurringAmounts,
  wrongTrialDays,
} from './text-checks';

const MONEY_HINT =
  /\$|\btrials?\b|\bcards?\b|\brefunds?\b|\bguarante|\bcancel|per month|\/\s?mo\b|\bbilled?\b|\bcharg(?:e|ed|es|ing)\b|\bdiscounts?\b|\d+\s?% off|\bfree forever\b|\bsubscri|\bupgrad|\bpaid\b|\bpric(?:e|es|ing)\b|\bpromo|\bcoupon|\brenew|\bannual/i;

export function hasMoneyHint(text: string): boolean {
  return MONEY_HINT.test(text);
}

export interface OfferGuardOptions {
  /** Kill-switch mode: every money sentence becomes the registered template. */
  readonly strict?: boolean;
  readonly offer?: Offer;
}

/** Violations in one piece of text; empty means it may be shown. */
export function offerClaimViolations(
  text: string,
  { strict = false, offer = OFFER }: OfferGuardOptions = {}
): readonly string[] {
  if (!hasMoneyHint(text)) return [];
  const v: string[] = [];
  if (strict) v.push('strict_templates_only');
  v.push(...forbiddenShapeViolations(text, offer));
  v.push(...wrongRecurringAmounts(text, offer).map(a => `amount:${a}`));
  v.push(...wrongPlanAmounts(text, offer).map(a => `plan_amount:${a}`));
  v.push(...wrongTrialDays(text, offer).map(a => `trial_days:${a}`));
  if (/\b\d+\s?% off\b|\bdiscount|\bcoupon/i.test(text))
    v.push('discount_claim');
  if (!offer.trial.enabled && /\btrial\b/i.test(text))
    v.push('trial_not_offered');
  if (
    (!offer.trial.enabled || offer.trial.requiresCard) &&
    /\bno\s+(?:credit\s+)?card\b/i.test(text)
  ) {
    v.push('no_card_not_offered');
  }
  return v;
}

export function offerGuardFallback(offer: Offer = OFFER): string {
  return `${claims(['price.pro', 'billing.renewal', 'billing.cancel'], offer)} Details are at jov.ie/pricing.`;
}

const SENTENCE_END = /(?<=[.!?])\s+|\n+/;

export interface GuardedText {
  readonly text: string;
  readonly violations: readonly string[];
  readonly replaced: boolean;
}

/** Replace each violating sentence with the offer line (once); keep everything else. */
export function guardOfferText(
  text: string,
  options: OfferGuardOptions = {}
): GuardedText {
  if (!hasMoneyHint(text)) return { text, violations: [], replaced: false };
  const offer = options.offer ?? OFFER;
  const parts = text.split(new RegExp(`(${SENTENCE_END.source})`));
  const violations: string[] = [];
  let usedFallback = false;
  const out = parts.map(part => {
    if (SENTENCE_END.test(part) && part.trim() === '') return part;
    const v = offerClaimViolations(part, options);
    if (v.length === 0) return part;
    violations.push(...v);
    if (usedFallback) return '';
    usedFallback = true;
    return offerGuardFallback(offer);
  });
  return violations.length
    ? {
        text: out
          .join('')
          .replace(/\s{2,}/g, ' ')
          .trim(),
        violations,
        replaced: true,
      }
    : { text, violations: [], replaced: false };
}

/**
 * Streaming gate. Text without money language streams through untouched; a
 * sentence that touches money is held until it is complete, checked, then
 * released or replaced. Bounded added latency: one sentence, money only.
 */
export class OfferStreamGate {
  private pending = '';
  private fallbackUsed = false;
  readonly violations: string[] = [];

  constructor(private readonly options: OfferGuardOptions = {}) {}

  private settle(sentence: string): string {
    const v = offerClaimViolations(sentence, this.options);
    if (v.length === 0) return sentence;
    this.violations.push(...v);
    if (this.fallbackUsed) return '';
    this.fallbackUsed = true;
    return offerGuardFallback(this.options.offer ?? OFFER);
  }

  /** Feed a delta; returns the text that is safe to release now. */
  push(delta: string): string {
    this.pending += delta;
    // Split off completed sentences (terminator + the whitespace after it has arrived).
    const re = /[.!?]+\s|\n/g;
    let cut = 0;
    let out = '';
    for (let m = re.exec(this.pending); m; m = re.exec(this.pending)) {
      const end = m.index + m[0].length;
      out += this.settle(this.pending.slice(cut, end));
      cut = end;
    }
    this.pending = this.pending.slice(cut);
    // The unfinished sentence streams only while it has no money language.
    if (this.pending && !hasMoneyHint(this.pending)) {
      out += this.pending;
      this.pending = '';
    }
    return out;
  }

  /** End of stream or a non-text chunk: validate and release what is left. */
  flush(): string {
    const rest = this.pending;
    this.pending = '';
    return rest ? this.settle(rest) : '';
  }
}

/** Facts block for prompts that may discuss the offer. Only these may be stated. */
export function offerFactsBlock(offer: Offer = OFFER): string {
  const lines = [
    claims(['price.free'], offer),
    claims(['price.pro', 'currency'], offer),
    claims(
      [
        'trial.summary',
        'trial.no_card',
        'trial.ends_to_free',
        'trial.never_charged_automatically',
        'billing.upgrade_during_trial',
      ],
      offer
    ),
    claims(
      ['billing.charged_at_checkout', 'billing.renewal', 'billing.cancel'],
      offer
    ),
  ].filter(Boolean);
  return [
    ...lines,
    'State only the facts above about price, trial, billing, renewal and cancellation. Never state discounts, refunds, guarantees, annual pricing, other prices, or what happens after the trial beyond these facts. If asked about anything else, say you are not sure and point to jov.ie/pricing.',
  ].join('\n');
}

/**
 * Call sites whose output may speak about Jovie's offer. Matched against the
 * telemetry functionId and `feature:` gateway tag at the AI SDK chokepoint.
 */
export const OFFER_GUARDED_FEATURES: readonly string[] = [
  'jovie-chat',
  'jovie-chat-onboarding',
  'jovie-chat-mobile',
  'summer',
  'ovie',
  'support',
  'tool-error',
];

export function isOfferGuardedFeature(feature: string | undefined): boolean {
  return (
    Boolean(feature) &&
    OFFER_GUARDED_FEATURES.some(
      f => feature === f || feature?.startsWith(`${f}.`)
    )
  );
}

/**
 * Every file that calls the AI SDK text/object generators, with the decision
 * about the offer guard. A new call site fails `guard.test.ts` until it is
 * classified here. 'guarded' = enforced at the SDK chokepoint via the
 * functionId / feature tag in OFFER_GUARDED_FEATURES.
 */
export const OFFER_GUARD_CALL_SITES: Readonly<Record<string, string>> = {
  'lib/chat/run.ts': 'guarded',
  'app/api/chat/conversations/[id]/messages/route.ts':
    'exempt: conversation title generation only (functionId jovie-chat-title); titles are not offer statements',
  'lib/chat/writing-pilot.ts':
    "exempt: rewrites the artist's own copy; Jovie's offer is not in scope",
  'lib/ai/sdk.ts': 'chokepoint (applies the guard)',
  'lib/ai/web-ai-health.ts': 'exempt: health ping, output never shown',
  'lib/connectors/gmail/extract-event-signal.ts':
    'exempt: structured extraction from email, output never shown to users',
  'lib/hud/humanize-pr-title.ts':
    'exempt: internal HUD copy about pull requests',
  'lib/inbox/classifier.ts': 'exempt: classification labels only',
  'lib/interviews/summarize.ts': 'exempt: summarizes an interview transcript',
  'lib/playlists/curate-tracklist.ts': 'exempt: track selection',
  'lib/playlists/generate-concept.ts':
    'exempt: playlist concept text about music',
  'lib/release-tasks/classify-task-cluster.ts':
    'exempt: classification labels only',
  'lib/services/insights/insight-generator.ts':
    "exempt: summarizes the artist's own stats; may quote the artist's own revenue, not Jovie's prices",
  'lib/services/packaging-intelligence/analyze.ts':
    'exempt: release packaging analysis',
  'lib/services/pitch/pitch-generator.ts':
    "exempt: pitches the artist's music to curators",
  'lib/services/retouching/provider-gemini.ts': 'exempt: image retouching',
  'tests/eval/knowledge-accuracy.eval.ts': 'exempt: eval harness',
};
