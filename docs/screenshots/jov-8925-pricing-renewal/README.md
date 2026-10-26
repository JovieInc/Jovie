# Pricing certification renewal for PR #22920

Observed 2026-10-26T00:28:40.959Z on the local public no-auth server at
`http://localhost:33120`, using Node 24.22.1, pnpm 9.15.9, Next 16.4.1 and
Chromium. Application source: `dedf699cef82c19d47a7dae031c07b96a2d91ca0`,
which merges current main into `grok/jov-8925-locked-footer`. The subsequent
repair changes certification metadata and evidence only.

The pricing census fingerprints `MarketingFooter.tsx` among its canonical
owners. The locked homepage footer changed that shared owner, invalidating the
previous pricing certification. Current main's digest still matches the previous
evidence; this PR's digest is
`08f8253d00c0004b2ca7fbf18c9b0591589c5df9766367c6e711bccbc54009e7`.
The checker and canonical owner list remain intact.

The existing pricing suite passed **10/10 tests**, covering pricing and comparison
content, plan selection at narrow and wide widths with both motion preferences,
keyboard operation, CTA destinations, campaign attribution, accessibility and
footer layout stability. The homepage footer structure suite passed **2/2 tests**
at 1440 and 390 pixels, including the five locked groups, four legal links,
theme controls, focus, hover and overflow.

Command from the repository root:

```sh
BASE_URL=http://localhost:33120 E2E_SKIP_WEB_SERVER=1 E2E_SKIP_SEED=1 E2E_SKIP_WARMUP=1 PUBLIC_NOAUTH_SMOKE=1 pnpm --filter @jovie/web exec playwright test tests/e2e/pricing.spec.ts tests/e2e/marketing-footer-structure.spec.ts --config=playwright.config.noauth.ts --project=chromium --workers=1 --reporter=line
```

Fresh captures and measurements are in [observations.json](observations.json):

| Width | Pricing capture | Header/main/footer container | Overflow |
| --- | --- | --- | --- |
| 320 | [320px](pricing-320.png) | x=24, width=272 | None |
| 390 | [390px](pricing-390.png) | x=24, width=342 | None |
| 768 | [768px](pricing-768.png) | x=32, width=704 | None |
| 1440 | [1440px](pricing-1440.png) | x=71, width=1298 | None |

The 390 and 1440 pricing captures were visually inspected. Pricing retains its
expanded navigation; `.marketing-footer-locked` is absent. Its legal band now
includes Cookies and DMCA alongside Privacy and Terms, an intended shared change
that this renewed certification observes. Existing focus order Privacy → Terms
and the absence of a duplicate footer CTA passed in the browser suite.

The locked homepage [390px](footer-390.png) and [1440px](footer-1440.png) footer
captures were also visually inspected. They retain the five groups and existing
theme/locale primitives within the same footer. This repair adds no UI or
interaction. These are local browser observations, separate from hosted CI,
deployment and production certification.

## Lossless encoding repair

On 2026-10-26, the 320px PNG's IDAT stream was recompressed with zlib level 9
to remove an accidental brand-scanner match in compressed bytes. The PNG shrank
from 401,422 to 376,612 bytes. Decoded scanlines and all non-IDAT chunks remain
byte-identical; their scanline SHA-256 is
`ae6f41e1a960e888970e1d8312dc9940b22ad79ee2e589dc466e019a5068c5b9`.
Chunk CRCs and the unchanged brand scanner pass. This changes file encoding only;
it does not renew the browser observation, source certification or design approval.
