/**
 * Product promise registry (Production Journey Auditor).
 *
 * A small, typed catalog of the critical user promises Jovie must keep. Each
 * entry names the entrypoint, the signals that prove the promise is kept, the
 * failure states that are never acceptable, and where deterministic coverage
 * lives (or should).
 *
 * This is load-bearing, not documentation: `scripts/journey-scout.ts` reads it
 * as its seed config (entrypoints + expected/unacceptable signals), and
 * `product-promises.test.ts` asserts every entrypoint is a real APP_ROUTES path.
 * A registry nothing consumes is ceremony — keep it wired.
 */

import { APP_ROUTES } from '@/constants/routes';

export interface ProductPromise {
  /** Stable kebab-case id. */
  readonly id: string;
  /** Human summary of the promise. */
  readonly promise: string;
  /** Route the journey starts from — must be an APP_ROUTES value. */
  readonly entrypoint: string;
  /** Whether the entrypoint is reachable without auth. */
  readonly anonymous: boolean;
  /** Observable signals that prove the promise is kept (testids / copy). */
  readonly successSignals: readonly string[];
  /** States that are never acceptable (what the scout flags). */
  readonly unacceptableFailures: readonly string[];
  /** Where deterministic coverage lives, or the suggestion if absent. */
  readonly suggestedCoverage: readonly string[];
}

export const PRODUCT_PROMISES: readonly ProductPromise[] = [
  {
    id: 'anonymous-signup-onboarding-starts',
    promise:
      'An anonymous visitor who lands on /start sees an initialized interview, can send a first answer, and gets an AI reply or a clear fallback.',
    entrypoint: APP_ROUTES.START,
    anonymous: true,
    successSignals: [
      'testid:onboarding-chat',
      'testid:onboarding-empty-intro',
      'composer input editable (role=textbox name=/chat message input/i)',
      'turn resolves to an assistant reply (testid:chat-message-reply) or a known fallback',
    ],
    unacceptableFailures: [
      'onboarding-chat container present but interview never initializes',
      'composer never becomes editable (stuck loading)',
      'POST /api/chat returns 500 / INTERNAL_ERROR on a real turn',
      'indefinite spinner with no reply and no fallback',
    ],
    suggestedCoverage: [
      'tests/e2e/canary-auth-signup-onboarding.spec.ts (init, gated)',
      'tests/e2e/canary-onboarding-turn.spec.ts (real turn, nightly)',
    ],
  },
  {
    id: 'logged-in-dashboard-loads',
    promise:
      'A signed-in creator who opens /app sees their dashboard render with real chrome, not an error or perpetual skeleton.',
    entrypoint: APP_ROUTES.DASHBOARD,
    anonymous: false,
    successSignals: [
      'dashboard shell renders',
      'no error boundary / 500',
      'skeletons resolve to content within budget',
    ],
    unacceptableFailures: [
      'error boundary or 500 on load',
      'perpetual skeleton / infinite loading',
      'redirect loop back to sign-in while authenticated',
    ],
    suggestedCoverage: [
      'tests/e2e/dashboard-pages-health.spec.ts',
      'add: deterministic /app load assertion under bypass auth',
    ],
  },
  {
    id: 'primary-connect-actions-work-or-explain',
    promise:
      'Connect actions either work, or clearly explain why a platform is unavailable — never a dead button.',
    entrypoint: APP_ROUTES.SETTINGS_CONNECTORS,
    anonymous: false,
    successSignals: [
      'connect CTA triggers an OAuth/connect flow or navigation',
      'unavailable platforms show an explicit disabled + reason state',
    ],
    unacceptableFailures: [
      'connect button does nothing on click (dead CTA)',
      'no explanation when a connector is unavailable',
      'silent failure with no toast / state change',
    ],
    suggestedCoverage: [
      'tests/e2e/connectors-magic-moment.spec.ts',
      'add: dead-CTA assertion per connector row',
    ],
  },
  {
    id: 'usage-metrics-show-data-or-explicit-state',
    promise:
      'Usage/earnings metrics show real data, or an explicit empty / loading / error state — never a blank or fake number.',
    entrypoint: APP_ROUTES.EARNINGS,
    anonymous: false,
    successSignals: [
      'real metric values render',
      'OR an explicit empty-state / loading / error component renders',
    ],
    unacceptableFailures: [
      'blank region where metrics should be',
      'hardcoded / placeholder numbers presented as real',
      'spinner that never resolves',
    ],
    suggestedCoverage: ['add: earnings empty/loading/error-state assertions'],
  },
] as const;

/** Look up a promise by id. */
export function getProductPromise(id: string): ProductPromise | undefined {
  return PRODUCT_PROMISES.find(p => p.id === id);
}
