---
paths: ["docs/design-present/**", "scripts/design-present/**", "apps/web/components/**", "apps/web/app/**"]
---

# Presentation gate: never show Tim a screenshot that fails our invariants

Founder, 2026-10-29, on PR #23710's before/after shots: "Why am I looking at a
screenshot that doesn't even pass our invariants for design?" A screenshot is
a claim that the work is good. It is checked before anyone sees it.

## Rule

Nothing visual reaches Tim (PR body, artifact page, Ovie card, chat) unless:

1. **Invariants pass on the rendered frame.** `pnpm design:present-check`
   measures the real DOM: every row in the content column starts on one axis
   (column + `--app-shell-header-seam-x`, Pen `app-panel-inset` 20), table
   headers align with their cells, no sub-pixel left edges, no emoji, icon
   tiles, bordered empty-state cards or oversized text tabs, no dev chrome or
   horizontal overflow, and the header and toolbar rows match the Pen
   reference (44 + 8 inset + 40).
2. **A vision critique passes** against the Pen reference and the bans
   (subscription lane, `scripts/design-present/vision.mjs`). Any blocking
   finding fails.
3. **It is shown three ways:** Pen reference | before (main) | after.

## How

- Pen first. The Pen frame is the target; design or polish it there, persist
  it (`.claude/rules/pen.md`), export the reference PNG and row readback into
  `docs/design-present/<set>/pen/`.
- Write `docs/design-present/<set>/manifest.json` (routes, persona, Pen nodes).
- Run the dev servers with `NEXT_DISABLE_TOOLBAR=1` and the test-auth bypass,
  then `pnpm design:present-check --manifest <set>/manifest.json
  --capture-before <main url> --capture <branch url>`. It writes
  `before/`, `after/` (PNG + geometry), `triptych/` and `receipt.json`.
- `node scripts/design-present/evidence.mjs --manifest <set>/manifest.json`
  pushes the images to the `design-present-evidence` branch (binaries stay
  out of the main tree) and pins that commit in the receipt.
- Commit the manifest, Pen readback, geometry and receipt. In the PR body,
  link only receipt images at the evidence commit
  (`https://github.com/JovieInc/Jovie/blob/<evidence>/docs/design-present/<set>/triptych/<id>.png?raw=true`)
  and add `<!-- design-present/v1 receipt=docs/design-present/<set>/receipt.json -->`.

## Enforced

`.github/workflows/design-present.yml` runs
`scripts/design-present/pr-body-check.mjs` on every PR open/edit/push: a body
with screenshots and no passing receipt fails. It re-runs the invariants from
the committed geometry, re-hashes every image, requires vision `pass`, and
rejects receipts from an older gate version, so `"pass": true` cannot be
hand-written. Non-UI images use `<!-- design-present-exempt: <reason> -->`.
Artifact generators call the same `runPresentCheck` and refuse to publish a
failing receipt.
