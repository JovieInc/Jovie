# Clef screenshot evaluator (advisory)

Decision: score rendered screenshots against the visually checkable DESIGN.md
rules with Cloudflare's Clef decision model on Workers AI, before a person
looks. Jev is text-only, so it cannot inspect pixels; Clef accepts up to four
images per request. The evaluator returns per-rule violation probabilities and
pass/fail at fixed thresholds. It never certifies a design, and founder taste
review is unchanged.

Module: `scripts/invariants/clef-screenshot-evaluator.mjs`.

## Usage

CLI (exit 0 = pass, 1 = fail, 3 = provider error or over budget):

```bash
# Capture a URL full-page at desktop 1440x900 and mobile 390x844@2x, then score it
node scripts/invariants/clef-screenshot-evaluator.mjs \
  --url http://localhost:3000/ --click 'text=Reject all' \
  --profile marketing --surface "homepage"

# Score existing screenshots (PNG/JPEG); each file is one view
node scripts/invariants/clef-screenshot-evaluator.mjs --profile app \
  --surface "Ovie generated card" shot-desktop.png shot-mobile.png
```

Flags: `--profile marketing|app` (`app` drops `dark_first` and
`title_case_display`), `--model clef|clef-flash` (default `clef`),
`--viewports desktop,mobile`, `--click SELECTOR` (for example, a cookie banner),
`--notes TEXT` (extra context).

Library, including the bounded revision loop:

```js
import {
  captureViews,
  evaluateScreenshots,
  runRevisionLoop,
} from './scripts/invariants/clef-screenshot-evaluator.mjs';

const receipt = await evaluateScreenshots(
  await captureViews({ url, click: 'text=Reject all' }),
  { profile: 'marketing', surface: 'homepage' }
);
// receipt.pass, receipt.failed (gated), receipt.advisories, receipt.rules[id].pViolation

const out = await runRevisionLoop({
  capture: () => captureViews({ url }),
  revise: async ({ notes }) => applyFixes(notes), // your agent's edit step
  profile: 'app',
});
// At most 2 revisions. If it still fails: out.shipWithNotes === true and out.notes lists each failure.
```

Credentials: `CLOUDFLARE_WORKERS_AI_TOKEN` (+ optional `CLOUDFLARE_ACCOUNT_ID`).
Otherwise the local `wrangler login` OAuth token, which needs the `ai:write`
scope and is refreshed through `wrangler whoami` when it is near expiry. Nothing
is logged except token counts. Cost is about $0.002 per desktop+mobile view pair
with `clef`. A daily cap (`CLEF_EVAL_DAILY_CAP_USD`, default $5) is enforced
from `~/.cache/jovie/clef-screenshot-ledger.jsonl`.

## Rules

| Rule | Threshold | Gates | Source |
|---|---|---|---|
| `dark_first` (marketing) | 0.20 | yes | marketing guide `darkOnly` |
| `low_contrast_text` | 0.70 | yes | DESIGN.md tokens |
| `all_caps_text` | 0.15 | yes | DETAILS.md text casing |
| `serif_type` | 0.30 | yes | DETAILS.md no-serif rule |
| `art_tampered` | 0.18 | yes | DESIGN.md "Do not fuck with art" |
| `competing_ctas` | 0.50 | yes | Subtraction: one primary action per region |
| `redundant_copy` | 0.50 | yes | Subtraction: no duplicated or stacked copy |
| `clutter` | 0.40 | yes | DESIGN.md restraint |
| `layout_defect` | 0.50 | advisory | DESIGN.md layout stability |
| `title_case_display` (marketing) | 0.50 | advisory | DETAILS.md marketing sentence case |

Each question asks whether a violation is present, and the score is the worst
case across views and tiles. Advisory rules are reported but never fail a
receipt, because the replay could not separate them.

## Replay evidence (2026-10-20)

21 full-page captures of production `jov.ie`: the homepage at desktop and
mobile, controlled violations injected into the homepage (light theme, low
contrast, serif, all caps, overlap, clutter, competing CTAs, Title Case,
duplicated headings, caps removed), and `/tim` with and without overlays on the
album art and avatar. Every image–rule pair was labeled by a strong model;
`redundant_copy` on the unmodified page was left unlabeled as a taste call.

| Model | Thresholds | Rule-level agreement | Recall | Precision | Image verdict agreement |
|---|---|---|---|---|---|
| `clef` | default 0.5 | 89% (n=186) | 16/33 | 16/19 | - |
| `clef` | calibrated, gated rules | **98% (n=148)** | 25/28 | 25/25 | **21/21** |
| `clef-flash` | calibrated, gated rules | 93% (n=148) | 23/28 | 23/28 | 18/21 |

The calibrated thresholds were fitted on this same set, so treat the 98% as
in-sample. Small uppercase eyebrow labels are the main miss: 3 of 17 fell below
the 0.15 floor. The live homepage fails `all_caps_text` because of the eyebrows
"CONNECTED PRESENCE", "AN OPEN SYSTEM" and "01 / IDENTITY". Latency was 4–14 s
per request with images (text-only calls take about 0.5 s).

**Ship now:** advisory receipts for homepage art direction and Ovie
generated-UI validation. **Re-evaluate when:** 100 receipts have founder or
reviewer dispositions. **Then:** refit the thresholds on that holdout, and
promote `layout_defect` only if it separates.
