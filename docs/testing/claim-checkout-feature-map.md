# Feature map — claim → checkout → recovery

Poteto / Anthropic verification style for wave 2. One journey; action → resulting
state; skip-reporting when a path is intentionally out of scope.

## Entry points

| Step | User action | Surface | Driver |
|------|-------------|---------|--------|
| 1. Claim front door | Open `/start` (or legacy `/onboarding` → `/start`) | `proxy` + start | Playwright URL + heading |
| 2. Identity | Sign in / continue session | Better Auth / test-auth | `E2E_USE_TEST_AUTH_BYPASS` persona |
| 3. Profile claim | Bind handle / artist | onboarding | `data-testid` / role |
| 4. Checkout | Enter `/onboarding/checkout` | billing + proxy auth gate | redirect when anon |
| 5. Paid | Stripe Checkout success return | stripe webhooks | webhook + entitlements |
| 6. Recovery | Past-due → pay succeeds | `lib/stripe/dunning.ts` | unit + property (Mut) |

## Success paths (must assert resulting state)

1. **Anonymous `/onboarding?resume=…`** → lands on `/start` with `resume` preserved; not `/app`. Spec: `proxy-auth-gate.spec.ts`.
2. **Anonymous `/app`** → first hop `/signin?redirect_url=/app`. Spec: `proxy-protected-path-fail-closed.spec.ts`.
3. **Anonymous `/onboarding/checkout`** → first hop `/signin?redirect_url=/onboarding/checkout` (no follow). Spec: `proxy-protected-path-fail-closed.spec.ts`.
4. **Authenticated checkout** → Checkout session created; return URL under app/onboarding. Existing checkout E2E / unit proof.
5. **Payment failed (attempt ≤4)** → dunning email template gets correct `daysRemaining`. Unit: `dunning.test.ts`.
6. **Payment recovered after `past_due`/`unpaid`/`incomplete`** → recovered email with invoice idempotency. Unit: `sendPaymentRecoveredEmail`.

## Cancel / error / empty

| Path | Expected | Covered by |
|------|----------|------------|
| Checkout abandoned | No entitlement upgrade; can resume | existing checkout tests |
| Provider send error / skipped | `{ success: false }`; no “sent” log | `dunning.test.ts` |
| Missing recipient email | fail closed; no send | `dunning.test.ts` |
| Attempt > 4 | `shouldSendDunningEmail` false | unit + property (#26159) |
| Retired `/investors` | 404 + `noindex` | `investor-portal-privacy` + proxy gate |

## Persistence

- Dunning idempotency key `payment-recovered:<invoiceId>` survives webhook retries.
- Entitlements after successful pay are source-of-truth in registry (not email).

## Skip-reporting (do not invent coverage)

- Screenshot-only “looks like checkout” without URL/session assertions.
- RLS policy matrix without Neon `DATABASE_URL` (MG Neon cert already owns this).
- Live Stripe network in unit tests (mocked gateway only).

## Wave linkage

- Wave 1 (#26159): heatmap Mut baseline + surface tokens + dunning properties.
- Wave 2 (#26160): proxy auth-gate E2E; dunning recovery + `daysRemaining` hardening; this map.
- Wave 3 (CI-9): promote heatmap+token matcher into JovieInc/ci; raise dunning Mut floor after mutation-diff; `/qa` skip-reporting against this map; RLS deferred unless Neon evidence still shows RED.

## Agent QA contract

`/qa` (`.claude/skills/qa/SKILL.md`) must load this map for claim→checkout→recovery
journeys and emit a **Skip report** for every intentionally untested path above.
Silent omission is not skip-reporting.
