# Pricing certification, 2026-10-15

Local public route: `http://localhost:3267/pricing`, Node 24.21.0, Chromium,
`PUBLIC_NOAUTH_SMOKE=1 NEXT_DISABLE_TOOLBAR=1 NEXT_PUBLIC_E2E_MODE=1`.
Source identity is the SHA-256 in the census evidence, covering the page and
listed canonical owners. Changing those bytes invalidates certification.
This is local source/browser evidence, not a deployment receipt.

| Evidence | Result |
| --- | --- |
| [Mobile, 390px](pricing-390.png) | Reviewed: full footer, wrapped comparison heading, no horizontal overflow |
| [Tablet, 768px](pricing-768.png) | Reviewed: shared grid, header and full footer |
| [Desktop, 1440px](pricing-1440.png) | Reviewed: shared shell, three plan cards, one closing CTA |
| Pricing Playwright suite | 11 passed, including setup; selection at 320–1440px, both motion preferences, keyboard, checkout links, redirect attribution |
| Axe WCAG 2 A/AA + 2.1 A/AA | Zero violations in main content and footer at 390/768/1440px; comparison additionally checked at 320px |
| Hydrated/footer geometry | Stable across two animation frames after fonts; no duplicate footer or closing CTA |
| Copy and offer truth | Existing pricing source guards + production route/JSON-LD tests pass; no public copy or plan semantics changed |

The footer regression test failed on the original minimal variant. The existing
painted-text test caught Artist Presence overflow at 320px; the shared comparison
heading now wraps. Existing tier-name, keyboard typeahead and consent-logo test
expectations were brought into line with current offer/permission registries.
Pricing enters [JOV-8101](https://linear.app/jovie/issue/JOV-8101) for ongoing
perceptual refinement. Full-footer and theme flags retain their shared behavior.
