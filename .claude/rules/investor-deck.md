---
paths: ["scripts/investor-deck/**", "apps/web/lib/investors/**", "apps/web/components/features/pitch/**"]
---

# Investor decks: generated, ledger-bound, gated

Company-wide (Jovie, LYB, any future product). Decided 2026-11-01.

- **Generate, never hand-build.** Every investor deck comes from
  `buildLedgerYcDeck` (`apps/web/lib/investors/yc-deck.ts`) via
  `node scripts/investor-deck/build.mjs`. A one-off HTML, Slides or Artifact deck
  is not a deck we send. Missing a feature? Extend the generator.
- **Ledger is the only source of numbers.** The story spec (`deck.yaml`) sits
  next to the private claims ledger (`claims.yaml`, `metrics.yaml`); every
  claim-like number on a slide must be a value of a claim or metric that slide
  cites. Retired (superseded or DROPPED) claims fail. The consistency check
  diffs runway months, monthly burn, view counts, raise and MRR against the
  application drafts. Private data never enters this repo.
- **Design system only.** The renderer emits colours from `design.tokens.json`
  semantic tokens and DS type; the test fails on a raw colour literal.
- **Marketing gates.** Run `@jovie/copy` (lint, then the flagship judge panel,
  register `founder-tim`) and `node scripts/anti-slop/run.mjs check --files
  <deck.html>` on every build you intend to send.
- **"Would you invest" gate.** `node scripts/investor-deck/eval.mjs --deck <dir>`
  then `gate.mjs`. Six persona SIMULATIONS built from partners' public stated
  criteria (never contact them, never present a verdict as theirs), on the
  Workers AI route `dev.investor-eval` (never `claude -p`). The gate opens only
  when calibration holds (known-bad holdouts all pass, positive anchor invests)
  and at least 4 of 6 personas say invest, for the same deck sha, within 3 days.
  Fix the top fixable objection in the story or ledger evidence, never by
  inventing facts; objections only traction can fix are reported, not argued.
