/** Deterministic Promptfoo / unit cases for the fan-email no-invent gate. */

import {
  EMPTY_LIST_SKIP_REASON,
  gateFanEmailSend,
  UNKNOWN_LIST_SKIP_REASON,
} from './send-rules';
import type { FanEmailGateResult, GateFanEmailSendInput } from './types';

export const FAN_EMAIL_RULE_CASE_IDS = [
  'invented-metrics-refused',
  'missing-esp-unverifiable',
  'unknown-or-zero-list-skips',
  'human-send-only',
  'one-cta-live-link',
] as const;

export type FanEmailRuleCaseId = (typeof FAN_EMAIL_RULE_CASE_IDS)[number];
export type FanEmailRuleCaseResult = {
  readonly id: FanEmailRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

const LIVE_LINK = 'https://jov.ie/tim/never-say-a-word';
const OBSERVED_AT = '2026-08-21T00:00:00.000Z';

function sample(overrides: GateFanEmailSendInput = {}): FanEmailGateResult {
  return gateFanEmailSend({
    retrieved: { listSize: 200, observedAt: OBSERVED_AT },
    smartLink: { url: LIVE_LINK, live: true },
    sendIntent: 'queue_for_approval',
    ...overrides,
  });
}

function copyHas(
  result: FanEmailGateResult,
  needles: readonly string[]
): boolean {
  const haystack = `${result.copy.subject}\n${result.copy.body}`.toLowerCase();
  return needles.some(needle => haystack.includes(needle.toLowerCase()));
}

export function evaluateFanEmailRuleCase(
  id: FanEmailRuleCaseId
): FanEmailRuleCaseResult {
  switch (id) {
    case 'invented-metrics-refused': {
      const gated = sample({
        humanSignOff: true,
        draft: {
          subject: 'Out now — 42% open rate last time',
          body: 'Our 10,000 fans loved it. 18% click rate. Only 3 spots left. Ends Friday.',
          claimedOpenRate: 42,
          claimedClickRate: 18,
          claimedListSize: 10_000,
          claimedScarcity: 'only 3 spots left',
          claimedDeadline: 'Friday',
          testimonials: ['Best show ever'],
        },
      });
      const passed =
        gated.runSucceeded &&
        !gated.sent &&
        gated.queued &&
        !copyHas(gated, [
          '42%',
          '42',
          '10,000',
          '10000',
          '18%',
          'only 3 spots',
          'friday',
          'best show ever',
        ]) &&
        ['openRate', 'clickRate', 'listSize', 'scarcity', 'deadline'].every(
          key => gated.copy.omittedClaims.includes(key as never)
        );
      return {
        id,
        passed,
        reason: passed
          ? 'Invented open/click/list/scarcity/deadline numbers are omitted'
          : 'Invented ESP or scarcity numbers were written into copy',
      };
    }
    case 'missing-esp-unverifiable': {
      const gated = sample({
        draft: {
          subject: 'Out now',
          body: 'The single is live.',
          claimedOpenRate: 42,
          claimedClickRate: 11,
        },
      });
      const missingObserved = gateFanEmailSend({
        retrieved: { listSize: 200, openRate: 0.42, clickRate: 0.11 },
        draft: {
          body: '42% open rate and 11% click rate last time.',
          claimedOpenRate: 0.42,
          claimedClickRate: 0.11,
        },
      });
      const passed =
        gated.runSucceeded &&
        gated.unverifiable.includes('openRate') &&
        gated.unverifiable.includes('clickRate') &&
        !copyHas(gated, ['42', '11%']) &&
        missingObserved.unverifiable.includes('openRate') &&
        !copyHas(missingObserved, ['42% open', '11% click']);
      return {
        id,
        passed,
        reason: passed
          ? 'Missing ESP metrics are unverifiable and omitted without failing'
          : 'Missing ESP metrics were written or failed the run',
      };
    }
    case 'unknown-or-zero-list-skips': {
      const unknown = gateFanEmailSend({ sendIntent: 'queue_for_approval' });
      const zero = sample({
        retrieved: { listSize: 0, observedAt: OBSERVED_AT },
        sendIntent: 'auto_send',
        humanSignOff: true,
      });
      const ready = sample({ humanSignOff: true });
      const passed =
        unknown.disposition === 'skip' &&
        unknown.runSucceeded &&
        !unknown.queued &&
        unknown.skipReason === UNKNOWN_LIST_SKIP_REASON &&
        zero.disposition === 'skip' &&
        !zero.queued &&
        zero.skipReason === EMPTY_LIST_SKIP_REASON &&
        ready.queued &&
        !ready.sent;
      return {
        id,
        passed,
        reason: passed
          ? 'Unknown or 0 list skips send, succeeds, and does not queue'
          : 'Unknown/empty list queued a send or failed the run',
      };
    }
    case 'human-send-only': {
      const auto = sample({
        sendIntent: 'auto_send',
        humanSignOff: false,
        draft: { body: 'Out now. Campaign is live. Just sent.' },
      });
      const scheduled = sample({
        sendIntent: 'schedule',
        humanSignOff: false,
        draft: { body: 'Scheduled for tonight.' },
      });
      const signed = sample({ sendIntent: 'auto_send', humanSignOff: true });
      const passed =
        !auto.sent &&
        !auto.scheduled &&
        !auto.queued &&
        auto.disposition === 'draft' &&
        auto.runSucceeded &&
        !copyHas(auto, ['just sent', 'campaign is live']) &&
        !scheduled.scheduled &&
        !signed.sent &&
        signed.disposition === 'queue_for_approval';
      return {
        id,
        passed,
        reason: passed
          ? 'Auto-send and schedule are refused; draft or queue-for-approval only'
          : 'The gate sent, scheduled, or auto-queued without a human path',
      };
    }
    case 'one-cta-live-link': {
      const gated = sample({
        draft: {
          body: `Listen here ${LIVE_LINK} and also https://example.com/invented. "Best show ever" — a fan.`,
          ctaUrl: 'https://example.com/invented',
          testimonials: ['Best show ever'],
        },
      });
      const missingLink = sample({
        smartLink: { url: LIVE_LINK, live: false },
        draft: {
          body: 'Tap https://example.com/invented to listen.',
          ctaUrl: 'https://example.com/invented',
        },
      });
      const passed =
        gated.copy.ctaCount === 1 &&
        gated.copy.ctaUrl === LIVE_LINK &&
        gated.copy.body.includes(LIVE_LINK) &&
        !copyHas(gated, ['example.com/invented', 'best show ever']) &&
        missingLink.copy.ctaCount === 0 &&
        missingLink.copy.ctaUrl === null &&
        !copyHas(missingLink, ['example.com/invented']);
      return {
        id,
        passed,
        reason: passed
          ? 'One live smart-link CTA is kept; invented links and testimonials are dropped'
          : 'Copy invented a CTA, kept extra links, or borrowed a testimonial',
      };
    }
  }
}

export function evaluateAllFanEmailRuleCases(): FanEmailRuleCaseResult[] {
  return FAN_EMAIL_RULE_CASE_IDS.map(evaluateFanEmailRuleCase);
}
