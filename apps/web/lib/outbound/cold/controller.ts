/**
 * Cold send controller: caps, warmup, ramp, auto-pause and the Ovie dial.
 *
 * Pure. It decides how many cold emails may leave today and from which
 * inbox; it never sends. It is fail-closed: until every gate is open (the
 * cold stream has its own domain, the mailing address is set, the provider is
 * configured, and the audience-delivery policy allows dispatch) the plan is
 * zero sends with the list of blockers.
 *
 * Ramp rule: an inbox moves up one warmup step only when its last 7 days show
 * bounce < 2%, complaints < 0.1% and the reply rate held (at least 80% of the
 * trailing baseline). Any breach of the cold stream ceiling pauses the inbox,
 * or the whole domain when the domain breaches, and raises a Summer incident.
 */

/** Days of warmup-only traffic before an inbox sends any cold email. */
export const WARMUP_DAYS = 14;

/**
 * Daily cold cap by step. An inbox starts at step 0 when warmup completes and
 * moves up one step per healthy 7-day week. 20/day per inbox is the ceiling
 * cold-email practice and Google's sender guidance support for new domains.
 */
export const RAMP_STEPS = [5, 10, 15, 20] as const;

/** Per sending domain, whatever the inbox count. */
export const DOMAIN_DAILY_CEILING = 60;

export const RAMP_HEALTH = {
  /** Increase only below these. */
  maxBounceRateToRamp: 0.02,
  maxComplaintRateToRamp: 0.001,
  /** Reply rate must hold at this share of the trailing baseline. */
  replyRateHoldRatio: 0.8,
  /** Pause at or above these (the cold stream ceiling). */
  pauseBounceRate: 0.03,
  pauseComplaintRate: 0.001,
  /** Rates are not judged below this many sends in the week. */
  minSample: 30,
} as const;

export interface InboxWeek {
  /** Last 7 days. */
  readonly sent: number;
  readonly bounced: number;
  readonly complained: number;
  readonly replied: number;
}

export interface ColdInbox {
  readonly id: string;
  readonly domain: string;
  /** When warmup traffic started. */
  readonly warmupStartedAt: Date;
  /** Current ramp step index into RAMP_STEPS; null while warming. */
  readonly rampStep: number | null;
  /** Paused by Tim or by the controller. */
  readonly paused: boolean;
  readonly lastWeek: InboxWeek;
  /** Reply rate over the 28 days before the week; null with no history. */
  readonly baselineReplyRate: number | null;
  /** Cold emails already sent today. */
  readonly sentToday: number;
}

export interface ControllerGates {
  readonly coldDomainConfigured: boolean;
  readonly coldDomainOnCore: boolean;
  readonly mailingAddressSet: boolean;
  readonly providerConfigured: boolean;
  /** The audience-delivery policy's verdict. False today by design. */
  readonly dispatchAllowed: boolean;
  /** Tim's global off switch in Ovie. */
  readonly globalPause: boolean;
  /** The onboarding flow prospects land in passed the dogfood judge. */
  readonly onboardingDogfoodPassed: boolean;
}

export type ControllerBlocker =
  | 'cold_domain_missing'
  | 'cold_domain_on_core'
  | 'mailing_address_missing'
  | 'provider_not_configured'
  | 'audience_delivery_disabled'
  | 'onboarding_not_dogfood_certified'
  | 'paused_by_tim'
  | 'no_active_inbox';

export const CONTROLLER_BLOCKER_LABELS: Record<ControllerBlocker, string> = {
  cold_domain_missing: 'No cold domain approved yet',
  cold_domain_on_core: 'Cold domain is on jov.ie, which is never allowed',
  mailing_address_missing: 'Mailing address not set (JOV-9648)',
  provider_not_configured: 'Sending provider not set up',
  audience_delivery_disabled: 'Sending is switched off in code',
  onboarding_not_dogfood_certified:
    'Onboarding flow has not passed the dogfood judge',
  paused_by_tim: 'Paused in Ovie',
  no_active_inbox: 'No warmed inbox yet',
};

export type InboxAction = 'warming' | 'hold' | 'ramp_up' | 'pause' | 'paused';

export interface InboxPlan {
  readonly inboxId: string;
  readonly domain: string;
  readonly action: InboxAction;
  readonly nextRampStep: number | null;
  readonly cap: number;
  readonly remainingToday: number;
  readonly reasons: readonly string[];
}

export interface ControllerIncident {
  readonly scope: 'inbox' | 'domain';
  readonly id: string;
  readonly kind: 'bounce_breach' | 'complaint_breach';
  readonly rate: number;
}

export interface ControllerPlan {
  readonly state: 'blocked' | 'paused' | 'running';
  readonly blockers: readonly ControllerBlocker[];
  /** Sends/day target from the Ovie dial. */
  readonly dialTarget: number;
  /** What the inboxes can carry today after health and warmup. */
  readonly capacityToday: number;
  /** min(dial, capacity, domain ceilings) minus what already went out. */
  readonly budgetToday: number;
  readonly inboxes: readonly InboxPlan[];
  readonly incidents: readonly ControllerIncident[];
}

const DAY_MS = 86_400_000;

function rate(part: number, whole: number): number | null {
  return whole >= RAMP_HEALTH.minSample ? part / whole : null;
}

export function planInbox(
  inbox: ColdInbox,
  now: Date
): {
  plan: InboxPlan;
  incident: ControllerIncident | null;
} {
  const base = { inboxId: inbox.id, domain: inbox.domain };
  const warmedAt = inbox.warmupStartedAt.getTime() + WARMUP_DAYS * DAY_MS;
  if (inbox.paused)
    return {
      plan: {
        ...base,
        action: 'paused',
        nextRampStep: inbox.rampStep,
        cap: 0,
        remainingToday: 0,
        reasons: ['Paused'],
      },
      incident: null,
    };
  if (now.getTime() < warmedAt) {
    const days = Math.ceil((warmedAt - now.getTime()) / DAY_MS);
    return {
      plan: {
        ...base,
        action: 'warming',
        nextRampStep: null,
        cap: 0,
        remainingToday: 0,
        reasons: [`Warming, ${days} days left`],
      },
      incident: null,
    };
  }
  const step = inbox.rampStep ?? 0;
  const { sent, bounced, complained, replied } = inbox.lastWeek;
  const bounceRate = rate(bounced, sent);
  const complaintRate = rate(complained, sent);
  // A single complaint on a small sample is already a breach at 0.1%.
  const complaintBreach =
    complained > 0 &&
    (complaintRate === null || complaintRate >= RAMP_HEALTH.pauseComplaintRate);
  if (complaintBreach) {
    return {
      plan: {
        ...base,
        action: 'pause',
        nextRampStep: step,
        cap: 0,
        remainingToday: 0,
        reasons: [`${complained} spam complaint(s) in 7 days`],
      },
      incident: {
        scope: 'inbox',
        id: inbox.id,
        kind: 'complaint_breach',
        rate: complaintRate ?? complained / Math.max(1, sent),
      },
    };
  }
  if (bounceRate !== null && bounceRate >= RAMP_HEALTH.pauseBounceRate) {
    return {
      plan: {
        ...base,
        action: 'pause',
        nextRampStep: step,
        cap: 0,
        remainingToday: 0,
        reasons: [`Bounce rate ${(bounceRate * 100).toFixed(1)}%`],
      },
      incident: {
        scope: 'inbox',
        id: inbox.id,
        kind: 'bounce_breach',
        rate: bounceRate,
      },
    };
  }

  const reasons: string[] = [];
  let next = step;
  const replyRate = sent > 0 ? replied / sent : null;
  const replyHeld =
    inbox.baselineReplyRate === null ||
    inbox.baselineReplyRate === 0 ||
    (replyRate !== null &&
      replyRate >= inbox.baselineReplyRate * RAMP_HEALTH.replyRateHoldRatio);
  if (bounceRate === null)
    reasons.push(`Holding: ${sent}/${RAMP_HEALTH.minSample} sends to judge`);
  else if (bounceRate >= RAMP_HEALTH.maxBounceRateToRamp)
    reasons.push('Holding: bounce at or above 2%');
  else if ((complaintRate ?? 0) >= RAMP_HEALTH.maxComplaintRateToRamp)
    reasons.push('Holding: complaints');
  else if (!replyHeld) reasons.push('Holding: reply rate fell');
  else if (step < RAMP_STEPS.length - 1) {
    next = step + 1;
    reasons.push(`Ramp to ${RAMP_STEPS[next]}/day`);
  } else reasons.push('At ceiling');
  const cap = RAMP_STEPS[Math.min(step, RAMP_STEPS.length - 1)] ?? 0;
  return {
    plan: {
      ...base,
      action: next > step ? 'ramp_up' : 'hold',
      nextRampStep: next,
      cap,
      remainingToday: Math.max(0, cap - inbox.sentToday),
      reasons,
    },
    incident: null,
  };
}

/**
 * Today's plan. The dial is a target, never a floor: the controller sends
 * less when warmup, health or domain ceilings say so, and nothing when a gate
 * is closed.
 */
export function planColdSends(input: {
  readonly gates: ControllerGates;
  readonly inboxes: readonly ColdInbox[];
  readonly dialTarget: number;
  readonly now: Date;
}): ControllerPlan {
  const { gates } = input;
  const blockers: ControllerBlocker[] = [];
  if (!gates.coldDomainConfigured) blockers.push('cold_domain_missing');
  if (gates.coldDomainOnCore) blockers.push('cold_domain_on_core');
  if (!gates.mailingAddressSet) blockers.push('mailing_address_missing');
  if (!gates.providerConfigured) blockers.push('provider_not_configured');
  if (!gates.dispatchAllowed) blockers.push('audience_delivery_disabled');
  if (!gates.onboardingDogfoodPassed)
    blockers.push('onboarding_not_dogfood_certified');

  const planned = input.inboxes.map(inbox => planInbox(inbox, input.now));
  const incidents = planned.flatMap(item =>
    item.incident ? [item.incident] : []
  );

  // Domain-level health: pool every inbox on the domain.
  const domains = new Map<string, InboxWeek>();
  for (const inbox of input.inboxes) {
    const sum = domains.get(inbox.domain) ?? {
      sent: 0,
      bounced: 0,
      complained: 0,
      replied: 0,
    };
    domains.set(inbox.domain, {
      sent: sum.sent + inbox.lastWeek.sent,
      bounced: sum.bounced + inbox.lastWeek.bounced,
      complained: sum.complained + inbox.lastWeek.complained,
      replied: sum.replied + inbox.lastWeek.replied,
    });
  }
  const pausedDomains = new Set<string>();
  for (const [domain, week] of domains) {
    const bounce = rate(week.bounced, week.sent);
    const complaint = rate(week.complained, week.sent);
    if (bounce !== null && bounce >= RAMP_HEALTH.pauseBounceRate) {
      pausedDomains.add(domain);
      incidents.push({
        scope: 'domain',
        id: domain,
        kind: 'bounce_breach',
        rate: bounce,
      });
    } else if (
      complaint !== null &&
      complaint >= RAMP_HEALTH.pauseComplaintRate
    ) {
      pausedDomains.add(domain);
      incidents.push({
        scope: 'domain',
        id: domain,
        kind: 'complaint_breach',
        rate: complaint,
      });
    }
  }

  const inboxes: InboxPlan[] = planned.map(({ plan }) =>
    pausedDomains.has(plan.domain) && plan.action !== 'paused'
      ? {
          ...plan,
          action: 'pause',
          cap: 0,
          remainingToday: 0,
          reasons: [...plan.reasons, 'Domain paused'],
        }
      : plan
  );

  // Domain ceiling.
  const byDomain = new Map<string, number>();
  for (const plan of inboxes)
    byDomain.set(
      plan.domain,
      (byDomain.get(plan.domain) ?? 0) + plan.remainingToday
    );
  let capacityToday = 0;
  for (const [, remaining] of byDomain)
    capacityToday += Math.min(remaining, DOMAIN_DAILY_CEILING);

  if (!inboxes.some(plan => plan.cap > 0)) blockers.push('no_active_inbox');
  if (gates.globalPause) blockers.push('paused_by_tim');

  const dialTarget = Math.max(0, Math.floor(input.dialTarget));
  const sentToday = input.inboxes.reduce(
    (sum, inbox) => sum + inbox.sentToday,
    0
  );
  const hardBlocked = blockers.some(b => b !== 'paused_by_tim');
  const state = hardBlocked
    ? 'blocked'
    : gates.globalPause
      ? 'paused'
      : 'running';
  const budgetToday =
    state === 'running'
      ? Math.max(0, Math.min(dialTarget - sentToday, capacityToday))
      : 0;
  return {
    state,
    blockers,
    dialTarget,
    capacityToday,
    budgetToday,
    inboxes,
    incidents,
  };
}

/**
 * Spread today's budget over inboxes with room, most remaining first, one at
 * a time so no single inbox carries the day.
 */
export function allocateSends(plan: ControllerPlan): Map<string, number> {
  const allocation = new Map<string, number>();
  const pool = plan.inboxes
    .filter(inbox => inbox.remainingToday > 0)
    .map(inbox => ({ id: inbox.inboxId, room: inbox.remainingToday }));
  let left = plan.budgetToday;
  while (left > 0 && pool.some(item => item.room > 0)) {
    pool.sort((a, b) => b.room - a.room);
    const next = pool[0];
    if (!next || next.room <= 0) break;
    next.room -= 1;
    allocation.set(next.id, (allocation.get(next.id) ?? 0) + 1);
    left -= 1;
  }
  return allocation;
}

/**
 * The approval rule: nothing is sent without a founder approval row for the
 * exact copy revision, or an auto-approval verdict for the item's segment.
 */
export interface SendCandidate {
  readonly leadId: string;
  readonly segment: string;
  readonly copyRevision: string;
  /** The prospect's artifact and the onboarding flow passed the judge. */
  readonly dogfoodPassed: boolean;
  readonly approval:
    | {
        readonly kind: 'founder';
        readonly approvedRevision: string;
        readonly actorUserId: string;
      }
    | { readonly kind: 'auto'; readonly verdictMode: 'auto' | 'review' }
    | null;
}

export function hasApprovalRecord(candidate: SendCandidate): boolean {
  const approval = candidate.approval;
  if (!approval || !candidate.dogfoodPassed) return false;
  if (approval.kind === 'founder')
    return (
      Boolean(approval.actorUserId) &&
      approval.approvedRevision === candidate.copyRevision
    );
  return approval.verdictMode === 'auto';
}
