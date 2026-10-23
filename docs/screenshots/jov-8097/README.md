# Pricing certification

## Current renewal, 2026-10-23, PR #22726

The document-title change invalidated Pricing's source digest. Renewed after
rendering source head `830a48dc602db723cd997431c248019f5be1fe9a` locally at
`http://localhost:33177/pricing`, using Node 24.22.1, Next 16.4.1 and Chromium.
The page and all listed canonical owners retain those exact source bytes in this
renewal. This is local source/browser evidence, not a production deployment receipt.

- `PUBLIC_NOAUTH_SMOKE=1 NEXT_DISABLE_TOOLBAR=1 NEXT_PUBLIC_E2E_MODE=1`.
- From the repo root, with that server running:
  `BASE_URL=http://localhost:33177 E2E_SKIP_WEB_SERVER=1 E2E_SKIP_SEED=1 E2E_SKIP_WARMUP=1 pnpm --filter @jovie/web exec playwright test tests/e2e/pricing.spec.ts tests/e2e/marketing-document-title-a11y.spec.ts --config=playwright.config.noauth.ts --project=chromium --workers=1 --reporter=line`:
  **15 passed** (10 pricing, 5 document-title regressions).
- Pricing's tab title is exactly `Pricing | Jovie`. The browser tests cover
  layout stability, overflow, keyboard plan selection, reduced motion, footer
  and main-content accessibility, offer links and campaign attribution.
- Refreshed captures: [320px](pricing-320.png), [390px](pricing-390.png),
  [768px](pricing-768.png), [1440px](pricing-1440.png). Reviewed 320px and 1440px;
  all four widths have one main, one pricing heading, one footer and no overflow.
- The three focused marketing title/SEO Vitest files passed **11 tests**.
- Source digest: `54b25357a7c78748ebf22c8cfb2a1576de2638d76b9cb7c5ce5c8b79ba54ea5e`.
- Additional CI evidence for that same source head:
  [UI capture run](https://github.com/JovieInc/Jovie/actions/runs/39905314379),
  artifact `pr-visual-review-22726-830a48dc602db723cd997431c248019f5be1fe9a`.
  Its local production-build DOM receipts report zero findings for Pricing at
  390px and 1440px; the screen audit marks Pricing green with its visual judge
  unavailable. This is CI render evidence, not production or visual-judge proof.

## Previous renewal, 2026-10-21

Current renewal: 2026-10-21, PR #22351 after merging PR #22382 from main.
Local source/browser evidence only. The merged source preserves the $12/month
self-serve offer and Pro claim CTA while moving shared container CSS into its
section-shell owner. Both changes are covered by the renewed source digest.

- Node 24.21.0, Next 16.4.1, Chromium; local URL `http://localhost:33151/pricing`.
- `PUBLIC_NOAUTH_SMOKE=1 NEXT_DISABLE_TOOLBAR=1 NEXT_PUBLIC_E2E_MODE=1`.
- `BASE_URL=http://localhost:33151 E2E_SKIP_WEB_SERVER=1 E2E_SKIP_SEED=1 E2E_SKIP_WARMUP=1 pnpm --filter @jovie/web exec playwright test tests/e2e/pricing.spec.ts --config=playwright.config.noauth.ts --project=chromium --workers=1 --reporter=line`: **10 passed**.
- Renewed captures: [320px](pricing-320.png), [390px](pricing-390.png),
  [768px](pricing-768.png), [1440px](pricing-1440.png). Reviewed at 320px and 1440px.
- At all four capture widths: no horizontal overflow and stable main-content
  geometry across two animation frames after fonts. The suite checks zero axe
  WCAG 2 A/AA + 2.1 A/AA violations in main content and the footer at its responsive
  viewports, keyboard plan selection, both motion preferences, comparison text
  geometry and campaign attribution.
- Pro displays $12/month and links to `/claim?plan=pro`; Free and Enterprise keep
  their existing actions. The browser suite now asserts the self-serve contract.
- Source digest: `3b81badb69eb5c619810a2762a09e4c69ac2145ad87457064631da0f798d56b4`.
  Rebound onto the 2026-10-21 renewal while merging the homepage branch:
  `MarketingHeader.tsx` and `ArtistProfileLandingPage.css` are pricing owners.
  The header CTA change is homepage-only, and `.ap-section-container` lives in
  `ArtistProfileSectionShell.css`. The captures are that 2026-10-21 renewal.

## Previous certification, 2026-10-15

Local public route: `http://localhost:3267/pricing`, Node 24.21.0, Chromium,
`PUBLIC_NOAUTH_SMOKE=1 NEXT_DISABLE_TOOLBAR=1 NEXT_PUBLIC_E2E_MODE=1`.
Source identity is the SHA-256 in the census evidence, covering the page and
listed canonical owners. Changing those bytes invalidates certification.
This is local source/browser evidence, not a deployment receipt.

| Evidence | Result |
| --- | --- |
| [Mobile, 320px](pricing-320.png) | Reviewed: complete one-line plan heading, wrapped feature labels, no horizontal overflow |
| [Mobile, 390px](pricing-390.png) | Reviewed: full footer, one-line comparison heading, no horizontal overflow |
| [Tablet, 768px](pricing-768.png) | Reviewed: shared grid, header and full footer |
| [Desktop, 1440px](pricing-1440.png) | Reviewed: shared shell, three plan cards, one closing CTA |
| Pricing Playwright suite | 11 passed, including setup; selection at 320–1440px, both motion preferences, keyboard, checkout links, redirect attribution |
| Axe WCAG 2 A/AA + 2.1 A/AA | Zero violations in main content and footer at 390/768/1440px; comparison additionally checked at 320px |
| Hydrated/footer geometry | Stable across two animation frames after fonts; no duplicate footer or closing CTA |
| Copy and offer truth | Existing pricing source guards + production route/JSON-LD tests pass; no public copy or plan semantics changed |

The footer regression test failed on the original minimal variant. The existing
painted-text test caught Artist Presence overflow at 320px; the shared comparison
heading now stays on one line with the shared 40% feature-column width. Existing
tier-name, keyboard typeahead and consent-logo test expectations were brought into
line with current offer/permission registries.
Pricing enters [JOV-8101](https://linear.app/jovie/issue/JOV-8101) for ongoing
perceptual refinement. Full-footer and theme flags retain their shared behavior.

PR #21801 gate repair: the component assertion and a browser text-range check
both failed on the original wrapping heading. After restoring `whitespace-nowrap`
and removing the mobile 60% feature-column override, all 11 Pricing Playwright
tests pass, including 320–1440px, both motion preferences, plan changes, keyboard,
footer accessibility and stable geometry. Captures and the census digest were
renewed after this run. The locked column-heading invariant is unchanged.
