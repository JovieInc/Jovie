/**
 * No-invent + human-send gate for fan_email_send.
 * Recoup newsletter + Klaviyo-audit RULES only (taxonomy, no HTTP, no
 * Klaviyo MCP, no mandatory MJML): never fabricate open/click/list-size
 * /scarcity/deadline numbers; missing ESP metrics are unverifiable (omit);
 * unknown or zero list skips send (run still succeeds, no queue); no
 * send/schedule without explicit human sign-off; one live CTA; no borrowed
 * testimonials.
 */

export const FAN_EMAIL_SEND_RULES = `FAN-EMAIL — newsletter + Klaviyo-audit RULES only. Never write open rate, click rate, list size, scarcity, or deadline numbers that were not retrieved this run. Missing ESP metrics → unverifiable (omit), not a fake number. If fan list size is unknown or 0, skip send. Run still succeeds. No queue. Do not send or schedule without explicit human sign-off. Draft/queue-for-approval is ok; auto-send is not. One CTA. Live smart link only if it actually exists. Do not invent a send. No borrowed testimonials.`;

export const FAN_EMAIL_RULE_CASE_IDS = [
  'invented-list-size-refused',
  'unknown-or-zero-list-skips-send',
  'missing-open-rate-unverifiable',
  'no-human-signoff-no-send',
  'one-cta',
] as const;

export type FanEmailRuleCaseId = (typeof FAN_EMAIL_RULE_CASE_IDS)[number];

export type FanEmailRuleCaseResult = {
  readonly id: FanEmailRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

export type FanEmailMetricStatus = 'retrieved' | 'unverifiable';

export type FanEmailListSizeStatus = 'known' | 'unknown' | 'zero';

export type FanEmailDisposition =
  | 'skip'
  | 'draft'
  | 'queue_for_approval'
  | 'send';

export interface FanEmailRetrievedFacts {
  readonly listSize?: number | null;
  readonly openRate?: number | null;
  readonly clickRate?: number | null;
  readonly scarcityCount?: number | null;
  readonly deadline?: string | null;
  readonly liveSmartLinkUrl?: string | null;
  readonly testimonials?: readonly string[] | null;
}

export interface FanEmailProposedCta {
  readonly url: string;
  readonly label?: string;
}

export interface FanEmailProposedCopy {
  readonly body?: string;
  readonly listSize?: number | null;
  readonly openRate?: number | null;
  readonly clickRate?: number | null;
  readonly scarcityCount?: number | null;
  readonly deadline?: string | null;
  readonly ctas?: readonly FanEmailProposedCta[] | null;
  readonly testimonials?: readonly string[] | null;
  readonly send?: boolean;
  readonly schedule?: boolean;
}

export interface GateFanEmailSendInput {
  readonly retrieved?: FanEmailRetrievedFacts | null;
  readonly proposed?: FanEmailProposedCopy | null;
  readonly humanSignOff?: boolean;
}

export interface FanEmailGatedMetrics {
  readonly listSize?: number;
  readonly listSizeStatus: FanEmailListSizeStatus;
  readonly openRate?: number;
  readonly openRateStatus: FanEmailMetricStatus;
  readonly clickRate?: number;
  readonly clickRateStatus: FanEmailMetricStatus;
  readonly scarcityCount?: number;
  readonly scarcityStatus: FanEmailMetricStatus;
  readonly deadline?: string;
  readonly deadlineStatus: FanEmailMetricStatus;
}

export interface FanEmailGateResult {
  readonly disposition: FanEmailDisposition;
  readonly send: boolean;
  readonly queued: boolean;
  readonly runSucceeded: boolean;
  readonly metrics: FanEmailGatedMetrics;
  readonly cta: FanEmailProposedCta | null;
  readonly testimonials: readonly string[];
  readonly omittedInvented: readonly string[];
  readonly reason: string;
}

const LIVE_SMART_LINK = 'https://jov.ie/tim/never-say-a-word';

function isRetrievedNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function classifyListSize(
  listSize: number | null | undefined
): FanEmailListSizeStatus {
  if (!isRetrievedNumber(listSize)) return 'unknown';
  if (listSize <= 0) return 'zero';
  return 'known';
}

function copiedNumber(
  retrieved: number | null | undefined,
  proposed: number | null | undefined,
  field: string,
  omitted: string[]
): { readonly value?: number; readonly status: FanEmailMetricStatus } {
  if (!isRetrievedNumber(retrieved)) {
    if (isRetrievedNumber(proposed)) omitted.push(field);
    return { status: 'unverifiable' };
  }
  if (isRetrievedNumber(proposed) && proposed !== retrieved) {
    omitted.push(field);
  }
  return { value: retrieved, status: 'retrieved' };
}

function copiedDeadline(
  retrieved: string | null | undefined,
  proposed: string | null | undefined,
  omitted: string[]
): { readonly value?: string; readonly status: FanEmailMetricStatus } {
  const live = retrieved?.trim();
  if (!live) {
    if (proposed?.trim()) omitted.push('deadline');
    return { status: 'unverifiable' };
  }
  if (proposed?.trim() && proposed.trim() !== live) omitted.push('deadline');
  return { value: live, status: 'retrieved' };
}

function copiedTestimonials(
  retrieved: readonly string[] | null | undefined,
  proposed: readonly string[] | null | undefined,
  omitted: string[]
): readonly string[] {
  const allowed = new Set(
    (retrieved ?? []).map(item => item.trim()).filter(Boolean)
  );
  const kept: string[] = [];
  for (const item of proposed ?? []) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (allowed.has(trimmed)) {
      kept.push(trimmed);
      continue;
    }
    omitted.push('testimonial');
  }
  return kept;
}

function copiedCta(
  liveSmartLinkUrl: string | null | undefined,
  proposed: readonly FanEmailProposedCta[] | null | undefined,
  omitted: string[]
): FanEmailProposedCta | null {
  const live = liveSmartLinkUrl?.trim() ?? '';
  if (!live) {
    if ((proposed ?? []).some(cta => cta.url?.trim())) omitted.push('cta');
    return null;
  }

  const matching = (proposed ?? []).filter(cta => cta.url?.trim() === live);
  const extras = (proposed ?? []).filter(cta => {
    const url = cta.url?.trim();
    return Boolean(url) && url !== live;
  });
  if (extras.length > 0) omitted.push('cta');
  if (matching.length > 0) {
    const first = matching[0];
    return first?.label ? { url: live, label: first.label } : { url: live };
  }
  if ((proposed ?? []).length === 0) return { url: live };
  return { url: live };
}

/**
 * Hard no-invent + human-send gate. Only numbers retrieved this run may
 * appear. Unknown/zero list skips without queueing. Auto-send is refused
 * without explicit human sign-off.
 */
export function gateFanEmailSend(
  input: GateFanEmailSendInput = {}
): FanEmailGateResult {
  const retrieved = input.retrieved ?? {};
  const proposed = input.proposed ?? {};
  const omittedInvented: string[] = [];

  const listSizeStatus = classifyListSize(retrieved.listSize);
  if (
    isRetrievedNumber(proposed.listSize) &&
    (listSizeStatus !== 'known' || proposed.listSize !== retrieved.listSize)
  ) {
    omittedInvented.push('listSize');
  }

  const openRate = copiedNumber(
    retrieved.openRate,
    proposed.openRate,
    'openRate',
    omittedInvented
  );
  const clickRate = copiedNumber(
    retrieved.clickRate,
    proposed.clickRate,
    'clickRate',
    omittedInvented
  );
  const scarcity = copiedNumber(
    retrieved.scarcityCount,
    proposed.scarcityCount,
    'scarcityCount',
    omittedInvented
  );
  const deadline = copiedDeadline(
    retrieved.deadline,
    proposed.deadline,
    omittedInvented
  );
  const testimonials = copiedTestimonials(
    retrieved.testimonials,
    proposed.testimonials,
    omittedInvented
  );
  const cta = copiedCta(
    retrieved.liveSmartLinkUrl,
    proposed.ctas,
    omittedInvented
  );

  const metrics: FanEmailGatedMetrics = {
    listSizeStatus,
    openRateStatus: openRate.status,
    clickRateStatus: clickRate.status,
    scarcityStatus: scarcity.status,
    deadlineStatus: deadline.status,
    ...(listSizeStatus === 'known' && isRetrievedNumber(retrieved.listSize)
      ? { listSize: retrieved.listSize }
      : {}),
    ...(openRate.value !== undefined ? { openRate: openRate.value } : {}),
    ...(clickRate.value !== undefined ? { clickRate: clickRate.value } : {}),
    ...(scarcity.value !== undefined ? { scarcityCount: scarcity.value } : {}),
    ...(deadline.value ? { deadline: deadline.value } : {}),
  };

  const wantsSend = proposed.send === true || proposed.schedule === true;
  if (wantsSend && (listSizeStatus !== 'known' || !input.humanSignOff)) {
    omittedInvented.push('send');
  }

  if (listSizeStatus !== 'known') {
    return {
      disposition: 'skip',
      send: false,
      queued: false,
      runSucceeded: true,
      metrics,
      cta: null,
      testimonials: [],
      omittedInvented,
      reason:
        listSizeStatus === 'zero'
          ? 'Fan list size is 0. Skip send. Run still succeeds. No queue.'
          : 'Fan list size is unknown. Skip send. Run still succeeds. No queue.',
    };
  }

  if (!input.humanSignOff) {
    return {
      disposition: 'queue_for_approval',
      send: false,
      queued: true,
      runSucceeded: true,
      metrics,
      cta,
      testimonials,
      omittedInvented,
      reason:
        'No explicit human sign-off. Draft/queue-for-approval only. Auto-send is not allowed.',
    };
  }

  if (!cta) {
    return {
      disposition: 'draft',
      send: false,
      queued: true,
      runSucceeded: true,
      metrics,
      cta: null,
      testimonials,
      omittedInvented,
      reason: 'No live smart link exists. Do not invent a send. Draft only.',
    };
  }

  return {
    disposition: 'send',
    send: true,
    queued: false,
    runSucceeded: true,
    metrics,
    cta,
    testimonials,
    omittedInvented,
    reason: 'Human sign-off present, list size known, live CTA exists.',
  };
}

function evaluateInventedListSizeRefused(): FanEmailRuleCaseResult {
  const gated = gateFanEmailSend({
    retrieved: { listSize: null },
    proposed: {
      listSize: 12_400,
      send: true,
      body: 'Our 12,400-fan list is waiting.',
    },
  });
  const serialized = JSON.stringify(gated);
  const passed =
    gated.disposition === 'skip' &&
    gated.send === false &&
    gated.queued === false &&
    gated.runSucceeded === true &&
    gated.metrics.listSize === undefined &&
    gated.omittedInvented.includes('listSize') &&
    !serialized.includes('12400') &&
    !serialized.includes('12,400');
  return {
    id: 'invented-list-size-refused',
    passed,
    reason: passed
      ? 'Invented list-size numbers are refused and omitted'
      : 'Invented list size was emitted or send was not skipped',
  };
}

function evaluateUnknownOrZeroListSkipsSend(): FanEmailRuleCaseResult {
  const unknown = gateFanEmailSend({
    retrieved: { listSize: null },
    proposed: { send: true },
    humanSignOff: true,
  });
  const zero = gateFanEmailSend({
    retrieved: { listSize: 0 },
    proposed: { send: true, listSize: 0 },
    humanSignOff: true,
  });
  const omitted = gateFanEmailSend({
    proposed: { send: true },
  });
  const passed =
    unknown.disposition === 'skip' &&
    unknown.send === false &&
    unknown.queued === false &&
    unknown.runSucceeded === true &&
    unknown.metrics.listSizeStatus === 'unknown' &&
    zero.disposition === 'skip' &&
    zero.send === false &&
    zero.queued === false &&
    zero.runSucceeded === true &&
    zero.metrics.listSizeStatus === 'zero' &&
    omitted.disposition === 'skip' &&
    omitted.queued === false &&
    omitted.runSucceeded === true;
  return {
    id: 'unknown-or-zero-list-skips-send',
    passed,
    reason: passed
      ? 'Unknown or zero list skips send; run succeeds; no queue'
      : 'Unknown or zero list did not skip send without queueing',
  };
}

function evaluateMissingOpenRateUnverifiable(): FanEmailRuleCaseResult {
  const gated = gateFanEmailSend({
    retrieved: { listSize: 80, openRate: null },
    proposed: { openRate: 0.42, clickRate: 0.18, body: '42% open rate' },
  });
  const serialized = JSON.stringify(gated);
  const passed =
    gated.metrics.openRate === undefined &&
    gated.metrics.openRateStatus === 'unverifiable' &&
    gated.metrics.clickRate === undefined &&
    gated.metrics.clickRateStatus === 'unverifiable' &&
    gated.omittedInvented.includes('openRate') &&
    gated.omittedInvented.includes('clickRate') &&
    !serialized.includes('0.42') &&
    !serialized.includes('42%');
  return {
    id: 'missing-open-rate-unverifiable',
    passed,
    reason: passed
      ? 'Missing open/click rates are unverifiable and omitted'
      : 'Missing ESP metrics were invented instead of marked unverifiable',
  };
}

function evaluateNoHumanSignoffNoSend(): FanEmailRuleCaseResult {
  const gated = gateFanEmailSend({
    retrieved: {
      listSize: 80,
      liveSmartLinkUrl: LIVE_SMART_LINK,
    },
    proposed: {
      send: true,
      schedule: true,
      ctas: [{ url: LIVE_SMART_LINK }],
    },
    humanSignOff: false,
  });
  const passed =
    gated.send === false &&
    gated.disposition === 'queue_for_approval' &&
    gated.queued === true &&
    gated.runSucceeded === true &&
    gated.omittedInvented.includes('send');
  return {
    id: 'no-human-signoff-no-send',
    passed,
    reason: passed
      ? 'No human sign-off queues for approval and refuses send'
      : 'Send or schedule proceeded without human sign-off',
  };
}

function evaluateOneCta(): FanEmailRuleCaseResult {
  const gated = gateFanEmailSend({
    retrieved: {
      listSize: 80,
      liveSmartLinkUrl: LIVE_SMART_LINK,
    },
    proposed: {
      ctas: [
        { url: LIVE_SMART_LINK, label: 'Listen' },
        { url: 'https://example.com/invented-presave', label: 'Pre-save' },
      ],
      testimonials: ['Pitchfork called this a masterpiece'],
    },
  });
  const noLink = gateFanEmailSend({
    retrieved: { listSize: 80, liveSmartLinkUrl: null },
    proposed: {
      ctas: [{ url: 'https://example.com/invented' }],
      send: true,
    },
    humanSignOff: true,
  });
  const signedOff = gateFanEmailSend({
    retrieved: {
      listSize: 80,
      liveSmartLinkUrl: LIVE_SMART_LINK,
    },
    proposed: { ctas: [{ url: LIVE_SMART_LINK }] },
    humanSignOff: true,
  });
  const passed =
    gated.cta?.url === LIVE_SMART_LINK &&
    gated.testimonials.length === 0 &&
    gated.omittedInvented.includes('cta') &&
    gated.omittedInvented.includes('testimonial') &&
    noLink.cta === null &&
    noLink.send === false &&
    noLink.omittedInvented.includes('cta') &&
    signedOff.send === true &&
    signedOff.cta?.url === LIVE_SMART_LINK;
  return {
    id: 'one-cta',
    passed,
    reason: passed
      ? 'Only a live smart link CTA is kept; invented links and testimonials are omitted'
      : 'Multiple CTAs, invented links, or borrowed testimonials were kept',
  };
}

export function evaluateFanEmailRuleCase(
  id: FanEmailRuleCaseId
): FanEmailRuleCaseResult {
  switch (id) {
    case 'invented-list-size-refused':
      return evaluateInventedListSizeRefused();
    case 'unknown-or-zero-list-skips-send':
      return evaluateUnknownOrZeroListSkipsSend();
    case 'missing-open-rate-unverifiable':
      return evaluateMissingOpenRateUnverifiable();
    case 'no-human-signoff-no-send':
      return evaluateNoHumanSignoffNoSend();
    case 'one-cta':
      return evaluateOneCta();
  }
}

export function evaluateAllFanEmailRuleCases(): FanEmailRuleCaseResult[] {
  return FAN_EMAIL_RULE_CASE_IDS.map(evaluateFanEmailRuleCase);
}
