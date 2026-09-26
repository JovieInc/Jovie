---
name: copywriting
description: Write, rewrite, review, or gate any Jovie words, including landing pages, marketing sections, product UI strings, lifecycle email and SMS, Jovie persona replies, founder drafts in Tim's voice, and copy written on behalf of customers (bios, release posts, fan emails). Runs the canonical @jovie/copy lint, tiered multi-model judge panel, and rewrite loop, and compiles landing pages stage by stage (capabilities, outcomes, copy, layout, style, design system, proof, stats and quotes). Use whenever an agent produces text a customer, fan, investor, or the public will read.
---

# Copywriting

One system for every word Jovie ships. Policy: [canon/VOICE.md](../../../canon/VOICE.md).
Executable rules: `packages/copy` (`@jovie/copy`). Read VOICE.md before your first
draft in a session. Do not keep private word lists or rubrics; add rules to
`packages/copy/rules.ts` with a failing fixture and a passing control.

## Contract

You may not hand back, commit, send, or publish text that has not passed its
tier's gate. If the rewrite loop exhausts its rounds, report `blocked` with the
final critique. Never water down the brief or skip the gate to get a pass.

## 1. Brief (always, before drafting)

Write down four things. If one is missing and changes the copy, find it in the
repo (capability registry, offer source, route) before asking.

- **Register**: `jovie-marketing`, `jovie-product-ui`, `jovie-transactional`,
  `jovie-persona`, `founder-tim`, or `customer-voice`.
- **Tier**: `flagship` (homepage, landing pages, launches, investor copy),
  `standard` (campaigns, founder drafts, blog, one-off customer work), or
  `volume` (runtime conversation and reply paths). Spend follows stakes; never
  run flagship on volume text.
- **Facts**: the only claims the copy may make, each traceable to a shipped
  capability, offer, or source. Save them one per line to `facts.txt`.
- **Reader and next action**: who reads it and the one thing they should do.

For `customer-voice`, collect two to five real samples of the customer's writing.
Their style wins; only the floor applies.

## 2. Draft from the outcome

Lead with what the reader gets. One idea per sentence. Specific nouns and numbers
over adjectives. Write the short version first. For marketing, write three headline
options that each state a different outcome, not three phrasings of one.

## 3. Gate and loop

```bash
# Lint only (volume tier, instant, free)
pnpm copy:check draft.md              # path must map to a register, or:
pnpm copy:judge --tier volume --register jovie-persona draft.txt

# Lint + judges (standard or flagship). Pass your own model so your family abstains.
pnpm copy:judge --tier flagship --register jovie-marketing \
  --facts facts.txt --audience "independent artists" --goal "claim a profile" \
  --generator anthropic/claude-opus-5.5 draft.txt
```

Status `pass`: done. Status `revise`: apply every critique line, then rerun.
Status `blocked`: rounds ran out or the judge panel could not be seated (judges
route through the Claude CLI, the Codex CLI, and GLM on the AI Gateway). Report
it; do not ship. When
critique says the copy is thin or generic, rewrite from the outcome up. Polishing
slop produces polished slop. Flagship allows four rounds, standard two. Exhausted
rounds mean `blocked`.

In code, use `writeUntilPass(brief, write, gatewayTransport(key))` for generated
copy and `lintCopy(text, { register })` on every volume send path.

## 4. Landing pages: compile in stages

Never start at layout or visuals. Build `landing.json` (shape: `LandingSpec` in
`packages/copy/landing.ts`) one stage at a time and run
`pnpm copy:landing landing.json` after each. Fix the first failing stage before
touching the next.

1. **Capabilities**: what the product does today, each with evidence (route,
   test, ProductMoment id). No evidence, no capability.
2. **Outcomes**: what the reader gets, each resting on released capabilities.
3. **Copy**: one outcome per section, hero headline <= 8 words, CTA <= 4 words
   with a real href. Then run every section through the flagship judge panel.
4. **Layout**: pick an approved recipe from `apps/web/data/marketing`
   (`docs/marketing/AGENT_GUIDE.md`); place every section once.
5. **Style**: theme and token version.
6. **Design system**: registered components only (DESIGN.md).
7. **Proof**: real product on screen for the hero promise, from a reproducible
   fixture.
8. **Social**: stats with source and date (within a year); quotes with a real,
   permissioned, attributable person.

Then implement through the marketing registry, keep copy in `apps/web/data/*Copy.ts`,
and open the PR. The `copy-gate` ci-fast lane re-lints every added line.

## 5. Sending

- Jovie registers: a passing gate is send authority.
- `founder-tim`: draft only. Queue for Tim's one-tap send; never send as Tim.
- `customer-voice`: pass the gate, then follow the customer's approval and
  consent settings.

## Report

State register, tier, rounds used, final gate status, and the judges that voted.
For landing pages, list stages passed and any stage still failing.
