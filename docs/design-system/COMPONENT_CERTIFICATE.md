# Component certificate

One machine-checkable record per shippable component (`jovie.component-certificate/v1`).
`pnpm component-ship-gate` stays the per-diff blocker; the certificate is the
persistent whole-tree ledger that says what each component still lacks.

Run: `node scripts/component-certificate.mjs --all --out report.json --summary`
or `--component <path> --spec` for the agent-ready work order.

Fail-closed: a criterion with no evidence is `unknown` and counts as missing.
Invalid JSON in an input file blocks report generation with a nonzero exit.

| Criterion | Pass when | Evidence |
| --- | --- | --- |
| ds-owner | no raw button/input/select/textarea/dialog outside `packages/ui/atoms` | source (static) |
| tokens | no palette classes, raw white/black, hex or colour functions | source (static) |
| states | each reachable state (loading, empty, error, partial, long-content, offline, permission-denied, rtl-overflow) has a story export, or a written waiver in `component-certification.json` | story file |
| tests | colocated test with assertions and, for interactive components, user-event interaction | test file |
| a11y | axe assertion in the current unit test, or passing CI evidence with the current component `sourceHash` | test file / CI |
| frontend-rules | no inline components, autoFocus, unstable keys, dimensionless images, null-while-loading, reset-on-open effects; text inputs have an input-retention test | source + test |
| mutation | sweep score at least `policy.mutationMin` (80), matching the current source/test `blob` key with a recorded run `sha` | `jovie-mutation` sweep state |
| visual | CI-captured baseline of the state stories with the current component `sourceHash` (never a Storybook build on gem) | CI artifact |
| journeys | every golden-path journey touching the component has a browser spec | `component-journeys.json` |
| benchmark | judgment recorded against the current `benchmark-library.json`, source unchanged, every adopt/adapt gap done, every skip has a reason | `component-benchmarks.json` |

The certificate computes its binding from the component's actual source bytes.
CI a11y, visual, and benchmark records must carry that SHA-256 `sourceHash`;
stale or unbound records remain `unknown`. Current unit-axe assertions remain
an independent source of a11y evidence.

Mutation records keep the canonical sweep format: `blob` is
`moduleKey(source Git blob, same-stem test Git blobs)` and `sha` is the measured
commit. The CLI recomputes the key from the current component and all tracked
same-stem tests under `apps/web`, including unstaged edits. A matching content
key can be reused after unrelated commits; a report's `--sha` does not refresh
that evidence. Missing/unreadable inputs or conflicting `sourceHash` metadata
remain unknown. A scored record also needs a finite numeric score from 0 to 100
and a nonnegative integer `valid` count; this adds no minimum-mutant floor.
Mutation sweep default scope is `lib/,app/api/`; pass
`--include components/...` to score components.

## Benchmark library

`benchmark-library.json` maps a job to the best-in-class behavior and to the
Jovie primitive that expresses it. Peak moments come first: checkout success,
profile claimed, first release live, first fan subscribed. Adopt the behavior,
never the visual identity. Adopted gaps become acceptance criteria for the
component.
