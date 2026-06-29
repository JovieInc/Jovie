/**
 * Anonymous onboarding full-turn canary (Production Journey Auditor).
 *
 * The deepest detector for the signup → interview journey: an anonymous visitor
 * lands on /start, sends a realistic first answer, and must get *either* a real
 * streamed AI reply *or* one of the known degraded-provider fallback messages —
 * never an indefinite spinner, never a 500 behind a rendered shell.
 *
 * Why this is a SEPARATE, nightly-tagged spec (not the gated merge lane):
 *  - It exercises a REAL, unmocked /api/chat turn (real LLM dispatch). Real
 *    model calls are slow and occasionally flaky, so per .claude/rules/testing.md
 *    ("real network → nightly") they must not gate deploys. The deterministic
 *    init assertions in canary-auth-signup-onboarding.spec.ts carry the gate.
 *  - Turnstile is bypassed on the local/CI dev server
 *    (NEXT_PUBLIC_E2E_MODE=1 → shouldBypassTurnstileForLocalRuntime), so the
 *    turn actually completes here. Production gates the turn behind Turnstile,
 *    which is why prod is only probed to initialization depth + the gate.
 *
 * This is the test the original break needed: existing chat specs mock the
 * stream (chat-first-turn-regression.spec.ts), so they never ran the real
 * toUIMessageStreamResponse() path that broke. This one does.
 *
 * QUARANTINE POLICY: if this spec flakes, do NOT silent-skip it — that recreates
 * the exact "no test caught it" failure. File a Linear issue and quarantine
 * explicitly. See tests/journey-auditor/README.md.
 *
 * Anonymous visitor — no auth required.
 *
 * @canary @nightly @auth-signup-onboarding
 */

import { expect, test } from '@playwright/test';
import { ONBOARDING_TURN_FALLBACK_MESSAGES } from '@/lib/canaries/auth-signup-onboarding';
import { AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES } from './fixtures/canary-auth-signup-onboarding';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  waitForHydration,
} from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/** Single bounded budget for the real LLM turn to resolve (reply or fallback). */
const TURN_RESOLVE_TIMEOUT = 45_000;

/** Regex over the known fallback contract (single source of truth in the lib). */
const FALLBACK_PATTERN = new RegExp(
  ONBOARDING_TURN_FALLBACK_MESSAGES.map(m =>
    m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|'),
  'i'
);

test.describe('Anonymous onboarding full turn', () => {
  test('sending a first answer yields an AI reply or a known fallback', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const response = await smokeNavigate(
      page,
      AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES.start,
      { timeout: SMOKE_TIMEOUTS.NAVIGATION }
    );
    expect(response?.status() ?? 0, '/start did not return 2xx').toBeLessThan(
      400
    );
    await waitForHydration(page);

    // Interview must be usable before we can answer.
    const composer = page.getByRole('textbox', {
      name: /chat message input/i,
    });
    await expect(composer, 'composer never became editable').toBeEditable({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const firstAnswer =
      'I make indie pop music and I want to set up my artist profile.';
    await composer.fill(firstAnswer);
    await page.getByRole('button', { name: /send message/i }).click();

    // The user's own message should appear — proves the send dispatched.
    await expect(
      page.getByText(firstAnswer),
      'user message never rendered after send'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Positive end state within budget: a real assistant reply OR a known
    // fallback. Asserting the positive state (not spinner-absence) and pinning
    // the fallback to the real contract keeps this from being flaky or from
    // passing on a broken error page.
    const assistantReply = page.getByTestId('chat-message-reply');
    const knownFallback = page.getByText(FALLBACK_PATTERN);
    await expect(
      assistantReply.or(knownFallback).first(),
      'onboarding turn produced neither an AI reply nor a known fallback within budget (stuck/loading or 500)'
    ).toBeVisible({ timeout: TURN_RESOLVE_TIMEOUT });

    // Composer recovers so the visitor can continue the interview.
    await expect(
      composer,
      'composer did not recover after the turn'
    ).toBeEditable({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });
});
