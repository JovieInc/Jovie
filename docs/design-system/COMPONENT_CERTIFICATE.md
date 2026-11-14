# Component certificate

One machine-checkable record per shippable component (`jovie.component-certificate/v1`).
`pnpm component-ship-gate` stays the per-diff blocker; the certificate is the
persistent whole-tree ledger that says what each component still lacks.

Run: `node scripts/component-certificate.mjs --all --out report.json --summary`
or `--component <path> --spec` for the agent-ready work order.

Gate: `node scripts/component-certificate.mjs --gate` (run by `pnpm
component-ship-gate`) fails when any component under a `gates` prefix in
`component-certification.json` has a gated criterion that is `fail` or
`unknown`. The gate only ratchets up: add a prefix once a layer is clean, and
add a criterion once its evidence producer exists. @jovie/ui is gated on
ds-owner, tokens, states, tests, a11y and frontend-rules as each component is
certified; mutation, visual and benchmark join once their producers record
source-bound evidence.

Order: `gates` and `waivers` in `component-certification.json` and screen
`debt` in `cert-screens.json` stay sorted by component path (plain code-unit
order), so a new entry lands at its own place instead of at the end, where
every PR appends; two PRs then conflict only when their components are path
neighbours. The gate fails on a map out of order, and
`node scripts/component-certificate.mjs --sort` sorts all three (the state
order inside a waiver stays as written). `--refresh` and `--enroll` write debt
sorted.

Fail-closed: a criterion with no evidence is `unknown` and counts as missing.
Invalid JSON in an input file blocks report generation with a nonzero exit.

| Criterion | Pass when | Evidence |
| --- | --- | --- |
| ds-owner | no raw button/input/select/textarea/dialog outside `packages/ui/atoms` | source (static) |
| tokens | no palette classes, raw white/black, hex or colour functions | source (static) |
| states | each reachable state (loading, empty, error, partial, long-content, offline, permission-denied, rtl-overflow) has a story export, or a written waiver in `component-certification.json` | story file |
| tests | colocated test with assertions and, for interactive components, user-event interaction | test file |
| a11y | current source/render-bound CI evidence, or unit axe when no CI observation exists | test file / CI |
| frontend-rules | no inline components, autoFocus, unstable keys, dimensionless images, null-while-loading, reset-on-open effects; text inputs have an input-retention test | source + test |
| forced-caps | no `uppercase` utility, `text-transform: uppercase` or inline `textTransform: 'uppercase'` (ASR-022); artist and release names keep their own spelling | source (static), rule in `scripts/lib/design-rules/forced-caps.mjs` |
| mutation | sweep score at least `policy.mutationMin` (80), matching the current source/test `blob` key with a recorded run `sha` | `jovie-mutation` sweep state |
| visual | CI capture of state stories with current component `sourceHash` and shared `renderInputs` binding (never a Storybook build on gem) | CI artifact |
| journeys | every golden-path journey touching the component has a browser spec | `component-journeys.json` |
| benchmark | judgment recorded against the current `benchmark-library.json`, source unchanged, a named `reference` (or a written `noPatternReason`), every gap with item/decision/reference, every adopt/adapt gap done, every skip has a reason | `component-benchmarks.json` |

The certificate computes its binding from the component's actual source bytes.
CI a11y, visual, and benchmark records must carry that SHA-256 `sourceHash`;
stale or unbound records remain `unknown`. Unit axe remains a fallback when
there is no CI observation; it cannot mask a stale pass or failure.

A passing a11y or visual record is a story-capture receipt
(`jovie.component-story-evidence/v1`, `scripts/lib/component-evidence.mjs`):
`sourceHash`, `renderInputs`, `captured`, and `stories: [{ id, themes }]` where every story was
captured in both `light` and `dark`. A pass without that proof is ignored (the
CLI names it on stderr), so the criterion stays unknown. Both passes and failures
need current source and render bindings. Legacy receipts without the new binding
remain readable historical evidence but cannot certify the current tree.

`renderInputs` uses `jovie.component-render-inputs/v1`: one sorted current-byte
SHA-256 snapshot per run, shared by every component. It includes frontend and
workspace package inputs, styles, stories, public assets, root build/package
pins, patches, and capture/evaluator scripts. Ordinary API/action routes, tests,
and documentation are excluded. Additions and unstaged edits count; missing
tracked files or unreadable Git/input state fail closed. Internal asset symlinks
bind their literal target and resolved file bytes; escaping/broken links fail
closed. The workflow contract tests enumerate current inputs and asset targets
to prove they can trigger refresh. New links into otherwise excluded locations
need explicit trigger admission. This is conservative render provenance, not a
complete transitive graph or authentication of an arbitrary `--base-url` server.

The consumer expects the hosted full-catalog Storybook settings (manual axe,
development mode, default public build values). Pilot or other noncanonical settings
cannot reuse that binding. Hosted capture starts a fresh server from the same
checkout. New shared-input paths refresh the existing canonical capture job;
the sixteen-shard matrix keeps its previous eligibility. Benchmarks and mutation
retain their existing, narrower contracts; this binding does not upgrade them.

`scripts/component-story-evidence.mjs` produces those receipts for every
`packages/ui` component. The `component-story-evidence` job in
`visual-a11y.yml` runs it on a GitHub-hosted runner (it refuses anything else,
so Storybook never runs on gem). It renders each story in light and dark and
fails on render or console errors, a theme that did not apply, or WCAG 2.2 AA
axe violations. A story that pins its theme through story `globals` (such as
`OperationsDark`) is checked in that theme only and is not listed as light and
dark proof. Only a screenshot hash is recorded, since there are no pixel
baselines yet. The job saves `visual.json` and `a11y.json` to the
`component-story-evidence-` cache, and `component-certificate.yml` restores
them. A successful trusted main CI, render, or mutation producer completion
refreshes the event's immutable current-main SHA, even when the producer ran
on an older ancestor. The trigger must be an ancestor of the target, which must
belong to main. Cancellation is scoped to that target. Cache reuse still requires
matching current input bindings; a late completion never refreshes old hashes.
Before negotiation and immediately before posting, the workflow rechecks main and keeps a
superseded report only as an immutable artifact (including explicit historical
dispatch targets). An unreadable main fails delivery closed. This check is not
atomic with Ovie ingestion; accepted-generation ordering is enforced separately
by the receiver's existing Postgres JSONB compare-and-set path.

Delivery carries optional `deliveryOrder` metadata with schema
`jovie.source-order/v1`, a positive safe-integer `sourceOrdinal` from
`git rev-list --count` on the full-history target, and this workflow's
`runNumber`/`runAttempt`. The target must match the report SHA. The receiver
trusts the authorized producer's main/ancestry proof; it does not fetch Git.
Source ordinal wins first, then run/attempt for the same SHA. Stale generations,
equal-height different SHAs, inconsistent same-SHA ordinals, and conflicting
equal-order content are rejected with 409 and the actually stored SHA. Exact
duplicates are idempotent. Legacy packets work only before ordered state exists.
All receiver writes, including legacy requests, use the same bounded CAS path;
storage failure or exhausted contention returns 503. The capped 50-row history
is explicitly best effort and cannot change latest acceptance.

The sender first requires authenticated OPTIONS on the existing route to return
`{ok:true,deliveryOrderSchema:"jovie.source-order/v1"}`; negotiation does no DB
work. Old/unavailable receivers fail delivery with the full artifact retained,
never a legacy fallback. POST success also requires an acknowledgement of the
exact stored SHA and order. The existing 64KiB route/60KiB compact-packet bounds
and full-report artifacts remain intact. HTTP acknowledgement is not an
independent readback of current persisted state; the delivery receipt retains
`ingestion: "unverified"` and records the attempted order.

Locally: start `storybook dev` in `apps/web`, then run
`node scripts/component-story-evidence.mjs --local --component packages/ui/atoms/button.tsx`.

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

## Empty data (one rule)

A field is empty only when its source is empty. When the source has no value,
the component shows its Empty state, and that state needs a story (or a written
waiver) under `states`. When the source has a value, the field must paint it:
never a blank name, a blank handle, a title missing next to its artwork, or a
loading skeleton left after the data arrived. The rendered check is
`expectRequiredFieldsPainted` in `apps/web/tests/e2e/helpers/preview-media-quality.ts`,
which the Golden Path runs through `expectPreviewIsReal`; reuse it rather than
writing a second check.

## Benchmark library

`benchmark-library.json` maps a job to the best-in-class behavior and to the
Jovie primitive that expresses it. Peak moments come first: checkout success,
profile claimed, first release live, first fan subscribed. Adopt the behavior,
never the visual identity. Adopted gaps become acceptance criteria for the
component.

## Component benchmark judgments

`benchmark-library.json` names product moments, and only a few of its patterns
name a @jovie/ui primitive (form-in-drawer, loading-skeleton, offline-degraded,
error-recovery, command-and-keyboard). It defines no per-component reference
set, so each @jovie/ui record in `component-benchmarks.json` is judged against
the WAI-ARIA APG pattern for the component plus the Radix/shadcn component it
wraps, and cites a library pattern where one names the primitive. The judge
compares props, keyboard, ARIA, states, RTL, controlled/uncontrolled, ref
forwarding and asChild, and lists what was compared in `checked`.

A record is one judgment: `libraryVersion`, the component's SHA-256
`sourceHash`, `reference` (or `noPatternReason` when no pattern applies),
`checked`, and `gaps`. Each gap has `item`, `decision` (adopt, adapt or skip),
`reference`, a `status` of open or done for adopt/adapt, and a `reason` for a
skip. `scripts/lib/component-benchmark-review.mjs` fails a current record that
names no reference or has an incomplete gap, so an empty `gaps` list cannot
pass without saying what it was compared against. Open adopt/adapt gaps keep
the criterion failing until the fix lands; editing the component makes the
record stale (`unknown`) until it is re-judged and re-hashed. Fixes in shared
`packages/ui/lib` styles do not change a component hash, so re-judge the
consumers when those change.

## Screen gate (Golden Path first)

`docs/design-system/cert-screens.json` lists the screens a customer sees, each by
its App Router page. Every component the page can render (the static import
closure of the page and the layouts above it, barrels followed by name) must pass
the registry's `criteria`. `pnpm component-certificate:gate` enforces it:

- a component on an enrolled screen that fails a criterion it does not owe blocks
  the merge, so a new component must be certified before it ships on the screen;
- `debt` maps each component to the criteria it failed when its screen was
  enrolled, as one comma-separated string per line. It may only shrink: an entry
  that now passes, or that no screen renders, must be removed in the same PR
  (`pnpm component-cert:screens --refresh`), and debt may not grow except for a
  screen being enrolled or a criterion being added to `criteria` (its current
  failures become debt in that PR, then only shrink); criteria are never removed;
- a screen with no debt left is must-pass.

One rule per concern, in `scripts/lib/design-rules/` (raw colours for `tokens`
in `raw-colors.mjs`). The all-caps rule lives in
`scripts/lib/design-rules/forced-caps.mjs` (`FORCED_CAPS_PATTERN`,
`countForcedCaps`, `findForcedCaps`, `isForcedCapsElement`). The certificate
reads it; the repo ratchet (`no-uppercase-ratchet.test.ts`) and the
rendered-page check (`expectNoForcedCaps`) should import it too, so the three
cannot drift.

Machine-driven expansion, for an agent loop:

- `pnpm component-cert:screens` prints coverage per screen;
- `pnpm component-cert:screens --issues out.json` writes the ranked work list
  (`jovie.cert-screens-report/v1`): one row per failing component with its
  screens, failing criteria, details and the `--spec` command that says what to
  fix, components on the most screens first, then the fewest failing criteria;
- `pnpm component-cert:screens --enroll <id> --page apps/web/app/.../page.tsx`
  enrolls a screen; never edit `screens` or `debt` by hand.
