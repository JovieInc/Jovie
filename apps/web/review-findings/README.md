# Review-Findings Ledger

Design/code review findings get classified and **encoded at the system
layer** — findings never die as one-off PR comments. Founder directive
2026-11-19 ("reviews raise the baseline"). The process and classification
taxonomy live in
[`docs/design-system/REVIEW_FINDINGS_ENCODING.md`](../../docs/design-system/REVIEW_FINDINGS_ENCODING.md).

## Files

- `findings.jsonl` — the ledger. Append-only, one JSON object per line.
- `banned-values.json` — lint rules grown **only** from encoded findings.
  Consumed by `apps/web/scripts/lint-review-findings.mjs`.
- `scripts/lint-review-findings.mjs` — the deterministic check
  (`pnpm lint:review-findings`). Informational by default; `--strict` is the
  promotion target for CI.

## Entry schema (`findings.jsonl`)

| field         | required | notes                                                            |
| ------------- | -------- | ---------------------------------------------------------------- |
| `id`          | yes      | `RF-NNNN`, monotonic                                              |
| `date`        | yes      | `YYYY-MM-DD`                                                      |
| `finding_class` | yes    | stable kebab slug, e.g. `design/all-caps-wide-tracking`           |
| `layer_encoded` | yes    | one of `token` \| `component` \| `lint` \| `visual` \| `env` \| `doc` |
| `pr_url`      | yes      | PR URL where the finding was made; `null` only for process/meta entries (put context in `notes`) |
| `notes`       | yes      | what was found, where it was encoded (rule id / test path / doc section), evidence |

## How to append

1. Append one line to `findings.jsonl` (valid JSONL — the lint validates
   integrity on every run, so a malformed append fails loudly).
2. Classify the finding per
   [`REVIEW_FINDINGS_ENCODING.md`](../../docs/design-system/REVIEW_FINDINGS_ENCODING.md)
   and encode it in the **same or a linked auto-merging PR** — a token rule,
   a colocated test, a lint pattern, a Storybook state, an env fixture, or
   (last resort) a doc.
3. Reference the encoding (rule id, test path, doc section) in `notes`.
4. Run `pnpm lint:review-findings` to confirm ledger + rules integrity.

## Repeat-finding rate

For a finding class `C` with encoding date `E(C)` (the date of the first
`C` entry whose `layer_encoded` points at a real encoding):

```
repeats(C)             = entries in C dated >= E(C), excluding the encoding entry itself
total(C)               = all entries in C
repeat_finding_rate(C) = repeats(C) / total(C)
```

A rate above 0 after encoding means the guardrail has a hole: **fix the
guardrail** (the rule/test that should have caught it) before adding more
rules for the same class.

## Rule lifecycle (`banned-values.json`)

- `shadow` — report only; the default lint run exits 0.
- `enforced` — the CI step runs `pnpm lint:review-findings --strict`, which
  fails on hits. A rule reaches `enforced` autonomously once the
  informational check has **>= 20 CI runs or 7 days with 0 false positives**
  and any pre-existing hits recorded in the ledger are fixed.
- Demote or delete a rule at a false-positive rate > 2% or when it has not
  matched across two consecutive quarterly prunes.
- Encoded checks are deterministic patterns only — never an AI-taste merge
  gate. Pen-first Tim taste approvals are unchanged.
