# Pricing certification renewal (main census red after #23600)

Owner fingerprint at 2026-10-29T18:42:51.000Z: `08157b107ab53755f8b64d849110922f7131a97724883fb0979803b6889fa54b`, source commit `a67bf3b19` (origin/main).

Why renewal: #23600 added a `copy-allow` comment around the copyright line in `MarketingFooter.tsx`, a /pricing
owner. The rendered DOM, text and layout are unchanged: the footer still renders "© 2026 Jovie Technology Inc.".
The census fingerprints owner bytes, so it went red on main until renewed.

Observed against a local Next dev server of this worktree (Chromium), not production:

- `tests/e2e/pricing.spec.ts`, chromium project: **11/11 passed**.
- Full-page captures at 1440 (stored downscaled to 960 wide) and 390, compressed for the repo byte budget:
  `pricing-1440.jpg`, `pricing-390.jpg`. scrollWidth equals clientWidth at both widths (1440/1440, 390/390), so no
  horizontal overflow.
