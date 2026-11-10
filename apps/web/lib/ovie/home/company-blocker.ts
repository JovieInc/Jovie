/**
 * The one revenue blocker Ovie Home and Summer both name (Tim, 2026-11-08:
 * "every day Tim's home state should show the current blocker and what is
 * in flight to fix it and what needs him if anything").
 *
 * It does not choose a constraint of its own. The choice is
 * `company-state.ts` `findConstraint` (revenue cone first, then the first
 * funnel step that drops to zero), read from the cached company snapshot, so
 * Home, Summer's iMessage brief and her dispatch read the same words from the
 * same cache with no third-party call. This module only turns that id into
 * operator copy and fills one gap: an all-zero funnel has no "drop", yet
 * nothing has been paid, so it must not read as clear.
 */

import { APP_ROUTES } from '@/constants/routes';
import type { HomeLoopConstraint } from '@/lib/home-loop/contract';
import {
  COMPANY_FUNNEL_STEPS,
  type CompanyFunnelStep,
  type CompanyStateSnapshot,
  effectiveCompanyMetricStatus,
  REVENUE_CONE_STEPS,
  type RevenueConeStep,
} from '@/lib/ovie/company-state';

export const COMPANY_BLOCKER_SCHEMA = 'jovie.company-blocker/v1' as const;

export type CompanyBlockerKind = 'certification' | 'funnel';

export interface CompanyBlocker {
  readonly schema: typeof COMPANY_BLOCKER_SCHEMA;
  /** `certification:<step>` or `funnel:<step>`, as company-state names it. */
  readonly id: string;
  readonly kind: CompanyBlockerKind;
  readonly step: RevenueConeStep | CompanyFunnelStep;
  readonly tone: 'bad' | 'warn';
  /** One plain sentence for Home and the iMessage brief. */
  readonly text: string;
  readonly detailsHref: string;
  /** When this blocker was first seen, if an investigation tracks it. */
  readonly since: string | null;
  /** The next action the investigation names, if any. */
  readonly nextAction: string | null;
  /** The snapshot this was read from. */
  readonly observedAt: string;
}

const CONE_COPY: Readonly<
  Record<RevenueConeStep, { readonly name: string; readonly why: string }>
> = {
  public_profile: {
    name: 'The public profile',
    why: 'no artist can be sent their profile yet',
  },
  homepage_entry: {
    name: 'The homepage entry',
    why: "visitors can't be trusted to reach sign-up",
  },
  onboarding_auth_claim: {
    name: 'Sign-up and claim',
    why: "an artist can't take their profile yet",
  },
  checkout_payment_entitlement: {
    name: 'Checkout',
    why: 'nobody can pay yet',
  },
  activation_dashboard: {
    name: 'First use after paying',
    why: 'a new customer may not get what they paid for',
  },
};

const FUNNEL_COPY: Readonly<Record<CompanyFunnelStep, string>> = {
  visits: 'real visits',
  eligible_entries: 'eligible entries',
  onboarding_starts: 'onboarding starts',
  account_creation: 'new accounts',
  claim_shown: 'claim prompts shown',
  claim_attempted: 'claim attempts',
  claim_completed: 'completed claims',
  checkout_shown: 'checkout views',
  checkout_started: 'checkout starts',
  paid: 'paid signups',
  activated: 'activations',
};

function isConeStep(value: string): value is RevenueConeStep {
  return (REVENUE_CONE_STEPS as readonly string[]).includes(value);
}

function isFunnelStep(value: string): value is CompanyFunnelStep {
  return (COMPANY_FUNNEL_STEPS as readonly string[]).includes(value);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isUnmeasuredFunnelStep(
  id: string | null,
  funnel: CompanyStateSnapshot['funnel']
): boolean {
  if (!id?.startsWith('funnel:')) return false;
  const step = id.slice('funnel:'.length);
  return isFunnelStep(step) && funnel[step].value === null;
}

/**
 * An all-zero (or zero-from-the-start) funnel never registers as a drop in
 * `findConstraint`, but with no paid signup it is not clear. Name the first
 * measured step that is zero.
 */
function firstZeroStep(
  funnel: CompanyStateSnapshot['funnel']
): CompanyFunnelStep | null {
  if (funnel.paid.value === null || funnel.paid.value > 0) return null;
  for (const step of COMPANY_FUNNEL_STEPS) {
    if (funnel[step].value === 0) return step;
  }
  return null;
}

function funnelText(
  step: CompanyFunnelStep,
  funnel: CompanyStateSnapshot['funnel']
): { text: string; tone: 'bad' | 'warn' } {
  const metric = funnel[step];
  if (metric.value === null)
    return {
      tone: 'warn',
      text: `${capitalize(FUNNEL_COPY[step])} aren't measured yet, so the funnel can't say where it stops`,
    };
  const index = COMPANY_FUNNEL_STEPS.indexOf(step);
  const before = index > 0 ? COMPANY_FUNNEL_STEPS[index - 1] : null;
  const prior = before ? funnel[before].value : null;
  if (before && prior !== null && prior > 0)
    return {
      tone: 'bad',
      text: `${prior} ${FUNNEL_COPY[before]} this week, but no ${FUNNEL_COPY[step]}`,
    };
  return { tone: 'bad', text: `No ${FUNNEL_COPY[step]} this week` };
}

export function companyBlocker(
  snapshot: Pick<
    CompanyStateSnapshot,
    | 'activeConstraint'
    | 'certification'
    | 'funnel'
    | 'generatedAt'
    | 'investigations'
  >,
  now: Date
): CompanyBlocker | null {
  // A funnel step that was never instrumented (company-state hard-codes some
  // as null) is a measurement gap, not today's blocker: it would otherwise
  // sit on Home for good. Name the first measured zero instead, or nothing
  // when revenue is flowing.
  const active = isUnmeasuredFunnelStep(
    snapshot.activeConstraint,
    snapshot.funnel
  )
    ? null
    : snapshot.activeConstraint;
  // Unmeasured paid signups mean revenue can't be called clear.
  const fallback = active
    ? null
    : snapshot.funnel.paid.value === null
      ? 'paid'
      : firstZeroStep(snapshot.funnel);
  const id = active ?? (fallback ? `funnel:${fallback}` : null);
  if (!id) return null;
  const [kind, step] = id.split(':') as [string, string];
  const investigation =
    snapshot.investigations.find(item => item.id === id) ?? null;
  const base = {
    schema: COMPANY_BLOCKER_SCHEMA,
    id,
    since: investigation?.firstObservedAt ?? null,
    nextAction: investigation?.nextAction ?? null,
    observedAt: snapshot.generatedAt,
  };
  if (kind === 'certification' && isConeStep(step)) {
    const status = effectiveCompanyMetricStatus(
      snapshot.certification[step],
      now
    );
    return {
      ...base,
      kind: 'certification',
      step,
      tone: status === 'red' ? 'bad' : 'warn',
      text:
        status === 'red'
          ? `${CONE_COPY[step].name} fails certification, so ${CONE_COPY[step].why}`
          : `${CONE_COPY[step].name} has no fresh certification, so ${CONE_COPY[step].why}`,
      detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
    };
  }
  if (kind === 'funnel' && isFunnelStep(step)) {
    return {
      ...base,
      kind: 'funnel',
      step,
      ...funnelText(step, snapshot.funnel),
      detailsHref: APP_ROUTES.ADMIN_GROWTH,
    };
  }
  return null;
}

/** Home shows the revenue blocker; shipping health only when none is known. */
export function homeConstraint(
  revenue: CompanyBlocker | null,
  shipping: HomeLoopConstraint | null
): HomeLoopConstraint | null {
  if (!revenue) return shipping;
  return {
    tone: revenue.tone,
    text: revenue.text,
    detailsHref: revenue.detailsHref,
  };
}
