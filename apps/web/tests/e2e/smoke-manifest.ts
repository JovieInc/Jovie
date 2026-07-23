/**
 * Canonical smoke manifest.
 *
 * Single source of truth for which spec files run in the focused PR smoke
 * lane (desktop) and the mobile parity smoke lane.
 *
 * Consumers:
 *   - `playwright.config.smoke.ts` → desktop lane
 *   - `playwright.config.smoke.mobile.ts` → mobile parity lane
 *   - `apps/web/package.json` smoke scripts
 *   - CI `ci-e2e-smoke` and any future mobile smoke job
 *
 * Adding a spec to either list makes it a deploy-gating signal. Keep the
 * lists short. Use the broader `-g @smoke` lane (`pnpm e2e:smoke:tagged`)
 * for the wider tagged-smoke discovery suite.
 *
 * Do NOT list specs that are active in `tests/quarantine.json` (kind: e2e).
 * The PR Fast Feedback job does not filter quarantine — quarantined specs
 * here re-enter the merge gate and recreate job-level flake (JOV-4033).
 */

export const DESKTOP_SMOKE_SPECS = [
  'smoke-public.spec.ts',
  'golden-path.spec.ts',
  // Quarantined (do not re-add while in apps/web/tests/quarantine.json):
  // - profile-fan-capture-golden-path.spec.ts (e2e-fan-capture-otp-timeout)
  // Un-quarantined in JOV-4179: the smoke lanes arm
  // CHAT_LLM_FAILURE_INJECTION=1 + SESSION_SECRET + UPSTASH_REDIS_* for it.
  'start-onboarding-llm-failure.spec.ts',
  'onboarding-robot.smoke.spec.ts',
  'signup-funnel.smoke.spec.ts',
  'claim-prebuilt.smoke.spec.ts',
  'smoke-auth.spec.ts',
  'shell-chat-v1.spec.ts',
  'shell-chat-v1-flag-off.spec.ts',
] as const;

export const MOBILE_SMOKE_SPECS = [
  'mobile-overflow.spec.ts',
  'profile-mobile-viewport-stability.spec.ts',
] as const;

export type DesktopSmokeSpec = (typeof DESKTOP_SMOKE_SPECS)[number];
export type MobileSmokeSpec = (typeof MOBILE_SMOKE_SPECS)[number];
