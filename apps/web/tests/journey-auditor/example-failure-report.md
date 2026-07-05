# Journey Scout report — example

> A real run of `scripts/journey-scout.ts` against a local dev server, committed
> as a reference. Live runs land in `.context/journey-scout/<runId>/report.md`
> (gitignored) with before/after screenshots.

# Journey Scout report — 2026-06-29_00-59-24

- Base URL: http://localhost:3000
- Promises checked: 4
- Findings: 1 (1 broken)
- Mode: report-only

> Report-only. No Linear issues created. Each broken promise below includes
> evidence and a proposed deterministic regression test.

## anonymous-signup-onboarding-starts — `ai-contract-failure` (P0)
- Route: `/start`
- Evidence: turn produced neither an AI reply nor a known fallback within 45s (stuck/loading or 500)
- Before: `…/anonymous-signup-onboarding-starts-before.png`
- After: `…/anonymous-signup-onboarding-starts-after-turn.png`

### Proposed test
```ts
// Proposed regression test for anonymous-signup-onboarding-starts (ai-contract-failure)
test('anonymous-signup-onboarding-starts: journey is not ai-contract-failure', async ({ page }) => {
  const resp = await page.goto('/start');
  expect(resp?.status() ?? 0).toBeLessThan(400);
  const composer = page.getByRole('textbox', { name: /chat message input/i });
  await expect(composer).toBeEditable();
  await composer.fill('test answer');
  await page.getByRole('button', { name: /send message/i }).click();
  const reply = page.getByTestId('chat-message-reply');
  const fallback = page.getByText(/temporary issue|still connecting|temporarily unavailable/i);
  await expect(reply.or(fallback).first()).toBeVisible({ timeout: 45_000 });
});
```

---

**What this run demonstrates.** The scout visited four product promises, kept
three (`ok`), and flagged exactly one real break — the anonymous onboarding turn,
which 500s in the dev runtime — at P0 with before/after evidence and a ready-to-
promote regression test. It filed zero Linear issues. That is the intended
behavior: low-noise, evidence-first, report-only.
