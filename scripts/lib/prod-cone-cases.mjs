/**
 * JOV-6920 full-cone case registry for the production golden-path
 * certification (scripts/prod-cert.mjs).
 *
 * The certification previously reported per-surface receipts only (8
 * surfaces); the JOV-6920 revenue gate requires the full 31-case cone —
 * stranger → entry → claim/auth → free state → offer → checkout/payment →
 * activation, including the failure/cancel/retry paths — to have a FIXED
 * denominator scoreboard (JOV-8370's no-silently-growing-denominator rule).
 *
 * The 31 cases are JOV-6920 §2 "Required checks", enumerated one case per
 * bullet (the compound "success/cancel/failure paths" bullet is three cases):
 *   entry 4 · claim/auth 6 · free state 4 · offer 5 · checkout/payment 8 ·
 *   post-pay activation 4 = 31. The measurement/receipts section is the
 *   receipt machinery itself (startedAt/endedAt/blocker per check), not a
 *   case.
 *
 * Every case maps to concrete producers:
 *  - checkIds on a certification surface receipt (run every cert), or
 *  - uncovered: no producer exists on the landed-production cert yet. The
 *    reason names the exact unblock. Uncovered is never counted as passed.
 *
 * This registry is frozen: adding/removing a case is a JOV-6920/JOV-8370
 * scope change with a new count, never a silent denominator edit.
 */

/** @type {Record<string, {phase: string, requirement: string}>} */
export const CONE_CASES = Object.freeze({
  'cone-entry-landing-renders': {
    phase: 'entry',
    requirement:
      'User lands on the correct current entry surface (anonymous front door renders)',
  },
  'cone-entry-claim-handoff': {
    phase: 'entry',
    requirement:
      'CTA/handoff matches the certified current product (claim CTA marker on the landing surface)',
  },
  'cone-entry-identity-survives-redirects': {
    phase: 'entry',
    requirement:
      'Candidate/profile identity survives redirects (/start?handle= keeps the handle through server redirects)',
  },
  'cone-entry-no-dead-route': {
    phase: 'entry',
    requirement:
      'No dead or misleading route on the entry path (/claim/start renders)',
  },
  'cone-claim-intent-survives-auth': {
    phase: 'claim',
    requirement: 'Claim intent survives auth',
  },
  'cone-claim-correct-artist-claimed': {
    phase: 'claim',
    requirement: 'Correct artist/profile is claimed',
  },
  'cone-claim-imported-state-preserved': {
    phase: 'claim',
    requirement: 'Existing imported state is preserved',
  },
  'cone-claim-refresh-back-retry-recoverable': {
    phase: 'claim',
    requirement: 'Refresh/back/retry are recoverable',
  },
  'cone-claim-duplicate-ownership-prevented': {
    phase: 'claim',
    requirement: 'Duplicate ownership/profile creation is prevented',
  },
  'cone-claim-invalid-input-fails-safely': {
    phase: 'claim',
    requirement:
      'Invalid/mismatched artist cases fail safely and truthfully (junk claim input never 500s or renders an error page)',
  },
  'cone-free-profile-useful': {
    phase: 'free',
    requirement: 'Free profile is complete enough to be genuinely useful',
  },
  'cone-free-ownership-understood': {
    phase: 'free',
    requirement:
      'User understands what they own and what Jovie has already done',
  },
  'cone-free-no-reentry-imported-info': {
    phase: 'free',
    requirement: 'No required re-entry of imported information',
  },
  'cone-free-capabilities-truthful': {
    phase: 'free',
    requirement: 'Visible capabilities are truthful (fresh user first value)',
  },
  'cone-offer-price-canonical': {
    phase: 'offer',
    requirement:
      'Price/package/copy match canonical billing truth (payable Pro option is the canonical $12/month Artist Presence price)',
  },
  'cone-offer-context-skippable': {
    phase: 'offer',
    requirement:
      'Offer appears in the intended context and is skippable where designed',
  },
  'cone-offer-free-state-not-falsely-degraded': {
    phase: 'offer',
    requirement: 'Free state is not falsely degraded to force payment',
  },
  'cone-offer-one-time-state-correct': {
    phase: 'offer',
    requirement: 'One-time/onboarding offer state behaves correctly',
  },
  'cone-offer-no-contradictory-pricing': {
    phase: 'offer',
    requirement:
      'No legacy/contradictory pricing on the payable rail (one monthly Artist Presence price exists in checkout pricing options)',
  },
  'cone-checkout-launches-owned-context': {
    phase: 'checkout',
    requirement: 'Checkout launches from the correct owned profile/context',
  },
  'cone-checkout-success-truthful': {
    phase: 'checkout',
    requirement: 'Checkout success path is truthful',
  },
  'cone-checkout-cancel-truthful': {
    phase: 'checkout',
    requirement: 'Checkout cancel path is truthful',
  },
  'cone-checkout-failure-truthful': {
    phase: 'checkout',
    requirement: 'Checkout failure path is truthful',
  },
  'cone-checkout-payment-is-authority': {
    phase: 'checkout',
    requirement: 'Verified Stripe payment is the authority for paid success',
  },
  'cone-checkout-entitlement-agrees': {
    phase: 'checkout',
    requirement: 'Entitlement agrees with payment',
  },
  'cone-checkout-retry-idempotent': {
    phase: 'checkout',
    requirement: 'Refresh/retry/webhook redelivery are idempotent/reconcilable',
  },
  'cone-checkout-no-false-paid-return': {
    phase: 'checkout',
    requirement:
      'No false paid state from a return-page redirect alone (unauthenticated /billing/success never renders an active paid plan)',
  },
  'cone-activation-immediate-value': {
    phase: 'activation',
    requirement: 'The user immediately sees a coherent next state/value',
  },
  'cone-activation-no-dead-end': {
    phase: 'activation',
    requirement: 'No legacy unlock-tile/dead-end experience',
  },
  'cone-activation-visible-path': {
    phase: 'activation',
    requirement: 'The paid promise has a visible activation path',
  },
  'cone-activation-continue-without-rescue': {
    phase: 'activation',
    requirement: 'The user can continue without founder/manual intervention',
  },
});

export const CONE_CASE_IDS = Object.keys(CONE_CASES);

export const CONE_CASE_COUNT = CONE_CASE_IDS.length;

/**
 * Why a case has no producer on the landed-production certification yet.
 * These are the exact unblocks; none can be closed by this registry —
 * claim walks need the JOV-9826 canary reset (no public profile per run),
 * payment walks need the sanctioned canary checkout producer.
 */
export const CONE_UNCOVERED_REASONS = Object.freeze({
  'cone-claim-intent-survives-auth':
    'no producer: an authenticated claim walk on production needs the JOV-9826 canary reset (a real claim per run would publish a public profile); case stays uncovered, never passed',
  'cone-claim-imported-state-preserved':
    'no producer: the catalog-import preservation walk needs the JOV-9826 canary reset on production',
  'cone-claim-refresh-back-retry-recoverable':
    'no producer on the landed-production cert: start-entry-continuity covers this in the ephemeral-DB CI lane only; fold it into the production smoke specs to cover',
  'cone-claim-duplicate-ownership-prevented':
    'no producer: duplicate-ownership prevention needs an authenticated second-claim attempt (JOV-9826 canary reset)',
  'cone-free-ownership-understood':
    'no producer: needs the authenticated dashboard walk beyond first-value (JOV-9826 canary reset)',
  'cone-free-no-reentry-imported-info':
    'no producer: needs the claim-to-onboarding continuity walk (JOV-9826 canary reset)',
  'cone-offer-context-skippable':
    'no producer: skippability needs the authenticated offer-context walk (JOV-9826 canary reset)',
  'cone-offer-free-state-not-falsely-degraded':
    'no producer: needs the authenticated free-vs-offer comparison walk (JOV-9826 canary reset)',
  'cone-offer-one-time-state-correct':
    'no producer: one-time offer state needs the authenticated onboarding walk (JOV-9826 canary reset)',
  'cone-checkout-success-truthful':
    'no producer: a verified Stripe test-mode payment on production is the sanctioned canary checkout walk, not yet folded into this cert',
  'cone-checkout-cancel-truthful':
    'no producer: the cancel path needs the sanctioned canary checkout walk (Stripe test mode)',
  'cone-checkout-failure-truthful':
    'no producer: the failure path needs the sanctioned canary checkout walk (Stripe test mode)',
  'cone-checkout-payment-is-authority':
    'no producer: payment authority needs a verified test-mode payment (canary checkout walk)',
  'cone-checkout-entitlement-agrees':
    'no producer: entitlement agreement needs a verified test-mode payment (canary checkout walk)',
  'cone-checkout-retry-idempotent':
    'no producer: webhook redelivery/retry reconciliation needs the canary checkout walk',
  'cone-activation-immediate-value':
    'no producer: post-pay activation needs a verified test-mode payment (canary checkout walk)',
  'cone-activation-no-dead-end':
    'no producer: post-pay dead-end audit needs a verified test-mode payment (canary checkout walk)',
  'cone-activation-visible-path':
    'no producer: post-pay activation path needs a verified test-mode payment (canary checkout walk)',
  'cone-activation-continue-without-rescue':
    'no producer: post-pay continuation needs a verified test-mode payment (canary checkout walk)',
});

/**
 * Cases with a producer on the cert. `checks` maps case id -> check id on
 * the named surface receipt. The check itself lives in
 * scripts/lib/prod-cert.mjs (anonymous checks) or is produced by the
 * post-deploy browser smoke (folded in as steps).
 */
export const CONE_CASE_PRODUCERS = Object.freeze({
  'cone-entry-landing-renders': {
    surface: 'landing',
    checkId: 'landing-renders',
  },
  'cone-entry-claim-handoff': {
    surface: 'landing',
    checkId: 'landing-claim-handoff',
  },
  'cone-entry-identity-survives-redirects': {
    surface: 'claim',
    checkId: 'start-preserves-handle',
  },
  'cone-entry-no-dead-route': {
    surface: 'claim',
    checkId: 'claim-start-renders',
  },
  'cone-claim-correct-artist-claimed': {
    surface: 'claim',
    checkId: 'claimed-profile-owned',
  },
  'cone-claim-invalid-input-fails-safely': {
    surface: 'claim',
    checkId: 'invalid-claim-input-fails-safely',
  },
  'cone-free-profile-useful': {
    surface: 'onboarding',
    checkId: 'dashboard-first-value',
  },
  'cone-free-capabilities-truthful': {
    surface: 'onboarding',
    checkId: 'fresh-user-onboarding-first-value',
  },
  'cone-offer-price-canonical': {
    surface: 'checkout',
    checkId: 'offer-canonical-pricing',
  },
  'cone-offer-no-contradictory-pricing': {
    surface: 'checkout',
    checkId: 'offer-no-contradictory-pricing',
  },
  'cone-checkout-launches-owned-context': {
    surface: 'checkout',
    checkId: 'checkout-entry-renders',
  },
  'cone-checkout-no-false-paid-return': {
    surface: 'checkout',
    checkId: 'return-page-no-false-paid',
  },
});

const CASE_STATUSES = ['passed', 'failed', 'blocked', 'uncovered'];

/**
 * Build the fixed-denominator scoreboard from one cert run's receipts.
 * A case's status is the status of its produced check; a missing producer
 * is `uncovered` (never passed, never silently absent).
 * @param {ReadonlyArray<{surface: string, status: string, blocker: string | null, checks: ReadonlyArray<{id: string, status: string, summary: string}>}>} receipts
 */
export function coneScoreboard(receipts) {
  const checkIndex = new Map();
  for (const receipt of receipts ?? []) {
    for (const check of receipt.checks ?? []) {
      checkIndex.set(`${receipt.surface}:${check.id}`, check);
    }
    // A whole-surface block (e.g. served-sha mismatch) also blocks the
    // surface's produced cases that never ran.
    if (receipt.status === 'blocked' && receipt.blocker) {
      for (const producer of Object.values(CONE_CASE_PRODUCERS)) {
        if (producer.surface === receipt.surface) {
          checkIndex.set(`${receipt.surface}:${producer.checkId}`, {
            id: producer.checkId,
            status: 'blocked',
            summary: receipt.blocker,
          });
        }
      }
    }
  }
  const cases = CONE_CASE_IDS.map(id => {
    const meta = CONE_CASES[id];
    const producer = CONE_CASE_PRODUCERS[id];
    if (!producer) {
      return {
        id,
        phase: meta.phase,
        requirement: meta.requirement,
        status: 'uncovered',
        checkId: null,
        surface: null,
        summary: CONE_UNCOVERED_REASONS[id] ?? 'no producer registered',
      };
    }
    const check =
      checkIndex.get(`${producer.surface}:${producer.checkId}`) ?? null;
    if (!check) {
      return {
        id,
        phase: meta.phase,
        requirement: meta.requirement,
        status: 'uncovered',
        checkId: producer.checkId,
        surface: producer.surface,
        summary: `producer registered (${producer.surface}:${producer.checkId}) but no such check ran on this receipt`,
      };
    }
    return {
      id,
      phase: meta.phase,
      requirement: meta.requirement,
      status: check.status,
      checkId: producer.checkId,
      surface: producer.surface,
      summary: check.summary ?? '',
    };
  });
  const counts = { total: cases.length };
  for (const status of CASE_STATUSES) {
    counts[status] = cases.filter(c => c.status === status).length;
  }
  // Unknown statuses (schema drift) are surfaced, never folded away.
  counts.other =
    cases.length -
    CASE_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  return {
    registry: 'jovie.prod-cone-cases/v1',
    total: counts.total,
    counts,
    cases,
  };
}

/**
 * One-line fixed-denominator summary for the run log.
 * @param {ReturnType<typeof coneScoreboard>} scoreboard
 */
export function formatConeScoreboardLine(scoreboard) {
  const { counts } = scoreboard;
  return `cone: ${counts.passed}/${counts.total} passed, ${counts.failed} failed, ${counts.blocked} blocked, ${counts.uncovered} uncovered (fixed JOV-6920 denominator)`;
}
