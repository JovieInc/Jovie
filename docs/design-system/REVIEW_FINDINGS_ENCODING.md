# Review-findings encoding (reviews raise the baseline)

> Founder directive, 2026-11-19: design/code reviews must **raise the system
> baseline**. The failure class this process closes: review findings die as
> one-off PR comments and nothing gets more deterministic over time.

## Classification — encode at the first layer that can hold it

Every review finding is classified, in priority order, and encoded in the
**same or a linked auto-merging PR**. No one-off overrides.

1. **token** — a banned raw value (color, spacing, type) that bypasses
   tokens → a rule in `apps/web/review-findings/banned-values.json` (cited
   to its ASR id when one exists).
2. **component/variant** — a component-contract violation → colocated test,
   Storybook state, or registry entry on the owning component.
3. **deterministic lint** — anything expressible as a static pattern → the
   review-findings lint (`apps/web/scripts/lint-review-findings.mjs`) or an
   existing eslint rule.
4. **visual regression / Storybook** — a pixel or rendered-state contract →
   snapshot or story state under the existing visual-QA lanes.
5. **env/preview fixture** — environment or preview-config drift → fixture
   or env-contract test.
6. **doc last** — only when no layer above can hold it deterministically.

## Standing rules

- Encode after **>= 2 recurrences** of a finding class, or **immediately**
  for a hard-constraint break.
- Encoded checks are deterministic patterns only. **Never an AI-taste merge
  gate.** Pen-first Tim taste approvals are unchanged and stay human.
- Cite anti-slop registry ids (`ASR-nnn`) — never restate their statements.
- Log every finding in the ledger with its encoding; repeat-finding rate per
  class is the health metric — see
  [`apps/web/review-findings/README.md`](../../apps/web/review-findings/README.md).
- Related canon: [GOVERNANCE.md](./GOVERNANCE.md),
  [anti-slop-rules.json](./anti-slop-rules.json),
  [DESIGN_LEARNING_LEDGER.md](./DESIGN_LEARNING_LEDGER.md) (taste-memory
  corrections — a different pipeline; findings here are code-level encodings).
