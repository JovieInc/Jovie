# Investor Brief V1 QA Evidence

**Date:** 2026-07-11

**Branch:** `codex/jov-3538-investor-portal-v1`

**Implementation commits:** `1ec5dbb4db3d426302ca952149ee7b85054f89f1`, `02ef3aed2eb290dee73b96031323972162c75be8`

## Verified Behavior

- Public `/pitch` returned 200 and emitted `noindex, nofollow` metadata.
- The canonical brief rendered all 7 core slides.
- The legacy HTML deck and downloadable PDF remain preserved on disk but are no longer linked from the investor portal because they contain superseded, unsupported claims.
- The founder letter opened and the appendix opened; the appendix was closed by default.
- Demo video, poster, and captions were reachable. Video playback and its play event were verified.
- Anonymous browser analytics were verified for `founder_letter_opened`, `meeting_cta_clicked`, `demo_started`, and `demo_completed`. The implementation also covers `portal_opened` and `deck_progressed`.
- Token-attributed event persistence is covered by focused route tests. It has not yet been verified against a live browser and database.
- The 375px mobile viewport had no horizontal overflow.
- The browser console had no application errors. Development-only font preload warnings and the development toolbar were excluded from this result.
- Axe scoped to `main` reported zero accessibility violations.

## Automated Checks

| Check | Result |
| --- | --- |
| Final Pitch Playwright after safe-appendix review | 3/3 passed |
| Focused Vitest run | 19/19 passed |
| Fundraising registry tests | 6/6 passed |
| Web TypeScript check | Passed |

The responsive and slide screenshots below were refreshed from the reviewed public `/pitch` implementation after the safe-appendix and claim-contract fixes.

## Development Timing

The local development run measured 193ms TTFB, 799ms DOM ready, and 811ms total. These measurements are diagnostic only and are not evidence that the production performance budget passes.

## Screenshot Index

Responsive portal captures:

- [Desktop](../screenshots/pitch-v1/portal-desktop.png)
- [Tablet](../screenshots/pitch-v1/portal-tablet.png)
- [Mobile](../screenshots/pitch-v1/portal-mobile.png)

Core narrative captures:

1. [Thesis](../screenshots/pitch-v1/slide-01-thesis.png)
2. [Problem](../screenshots/pitch-v1/slide-02-problem.png)
3. [Wedge](../screenshots/pitch-v1/slide-03-wedge.png)
4. [Product](../screenshots/pitch-v1/slide-04-product.png)
5. [Operating Loop](../screenshots/pitch-v1/slide-05-loop.png)
6. [Founder](../screenshots/pitch-v1/slide-06-founder.png)
7. [Round](../screenshots/pitch-v1/slide-07-round.png)

## Evidence Boundary

The unresolved company-evidence gaps listed in the canonical fundraising registry remain intentionally unresolved. They are diligence and operating-system inputs—not failures of this portal implementation—and unsupported claims remain excluded from the core narrative.
