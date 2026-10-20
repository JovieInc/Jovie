# Pricing certification, renewed 2026-10-20

Local public route: `http://127.0.0.1:33151/pricing`, Node 24.21.0, Chromium,
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
| Pricing Playwright suite | 10 passed with the public no-auth runner; selection at 320–1440px, both motion preferences, keyboard, checkout links, redirect attribution |
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

PR #22351 renewal: extracting `.ap-section-container` into its existing shell
changed a listed stylesheet owner and invalidated the source digest. The
existing pricing suite passed all 10 tests using `playwright.config.noauth.ts`
against the production build. The four linked captures were regenerated and
the 320px capture was reviewed for legibility and overflow. The canonical
status, owner list, comparison-heading invariant, and certification checks
are unchanged. The renewed source digest covers the page and listed owners;
this remains local browser evidence, not a deployment receipt.
