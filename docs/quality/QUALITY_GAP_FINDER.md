# Quality gap finder

Status: shipping. Owner: Summer (operation), Tim (low-confidence decisions).
Code: [`scripts/quality-gap-finder.mjs`](../../scripts/quality-gap-finder.mjs).
Workflow: [`.github/workflows/quality-gap-finder.yml`](../../.github/workflows/quality-gap-finder.yml).

The finder looks for missing tests, guardrails, and invariants and proposes
them as Linear issues. It is deterministic and model-free. One run is one
filesystem walk, one `git log`, and at most four Linear queries. That makes it
cheap enough to run on every relevant event. It has no clock. Scheduled handler
invocations are rejected before collection or writes. Shipping SLO no longer
runs post-mortem learning. The [learning delivery contract](EVENT_DRIVEN_LEARNING.md)
distinguishes this deterministic owner from pending shared-compiler acceptance.

## When it runs

| Trigger | Why |
| --- | --- |
| Push to `main` touching its repo evidence: post-mortems, invariants, route budgets, the coverage heatmap, the detection coverage registry, the CI incident ledger, ci-fast lanes, or `apps/web/{app,components,lib}` | Churn, coverage, route, post-mortem, and invariant gaps can only change on one of these pushes. Runs coalesce: one runs, the newest waits |
| `repository_dispatch` type `quality-gap-scan` | Bug intake, dogfood labels, and Sentry mirrors fire this (see "Event hooks") |
| `workflow_dispatch` (optional `dry_run`) | Manual run |

Locally: `pnpm quality:gaps` prints the JSON report as a dry run and writes
nothing. Add `--file` with `LINEAR_API_KEY` to file issues.

## What it looks for

| Kind | Evidence | Confidence |
| --- | --- | --- |
| `invariant-evidence-unwired` | A canon invariant has no enforcing test, or cites a test that no workflow, package script, ci-fast lane, or Vitest include glob runs | 0.85 |
| `postmortem-class-unguarded` | A post-mortem failure class that no invariant, CI incident ledger entry, or script names. Classes with open `postmortem-action` issues are skipped while those issues are open | 0.8 when recurring or when every action closed; otherwise 0.55 |
| `escaped-defect-untested` | A `bug`, `dogfood`, `sentry`, `intake`, or `escaped-defect` issue updated in the last 30 days names a source file that has no test | 0.8 (0.85 if the fix already shipped) |
| `escaped-defect-closure-unverified` | A completed `escaped-defect` issue lacks a valid product-repair + detector-repair [closure receipt](ESCAPED_DEFECT_CLOSURE.md) | 1.0 |
| `founder-rescue-detection-gap` | A defect description or Tim comment records a founder rescue and no live-verified detector receipt on that issue predates it. The proposal embeds a typed `jovie.detection-gap/v1` record. A later rescue of a class a live-verified capability already covers is filed as a P0 compiler regression | 1.0 |
| `detection-capability-unlearned` | The highest impact × recurrence × invisibility × tractability × remediation-leverage blind spot in `apps/web/data/detection-coverage-registry.json` | 0.95 |
| `component-state-untested` | A UI component changed in the window with neither a story nor a test | 0.78 for shared or 3+ commits; 0.6 for 2 commits; 1 commit is below the floor |
| `changed-code-untested` | An API route or `lib` module changed in the window with no test | 0.8 for routes or 2+ commits; 1 commit is below the floor |
| `coverage-evidence-stale` | `docs/TEST_COVERAGE_HEATMAP.md` is older than 30 days, or a module lost 3 or more points of line coverage (`--coverage-summary` plus `--coverage-baseline`) | 0.85 / 0.8 |
| `route-budget-missing` | A public route is missing from `apps/web/scripts/performance-route-manifest.ts`, grouped by section | 0.8 for profile and home; 0.6 for other sections |

"Has a test" errs toward yes, so proposals stay precise. Any of these counts:

- a sibling test
- a test file with the same base name anywhere in the tree
- a test that imports the module, its directory barrel, or a route test named after its path segments
- a test on a file that imports the module (one hop)

Proposals below 0.5 confidence are dropped as noise.

An escaped-defect closure proposal names and links the originating defect. Its
suggested action is to reopen and complete that issue, never to use the quality
gap proposal as a parallel product-repair record.

A capability is counted as learned only when its registry entry names a
deliberate-red replay, a valid control case, and the last live or injected
Summer-path firing. The same registry drives the Ovie HUD coverage, blind-spot,
founder-rescue, trend, and next-capability view.

## Routing

| Confidence | Result |
| --- | --- |
| ≥ 0.75 | Linear issue in **Backlog**, label `quality-gap`, plus `agent-ready` when the fix is mechanical (add a test, story, budget entry, or CI wiring). Summer dispatches it like any other backlog work. |
| 0.5 to 0.75 | Linear issue in **Backlog**, label `quality-gap:needs-tim`. Summer turns it into an Ovie inbox card for Tim (below). |

The finder does not call `POST /api/internal/ovie/summer-cards` itself. That
endpoint requires Summer's OIDC identity, and Summer owns Tim's inbox. Filing a
labeled issue keeps one writer for the inbox and one system of record (Linear).

## Dedupe and caps

- Each proposal has a stable fingerprint, `qg-<8 hex>`, computed from its
  kind and subject (file, route group, class, or invariant). The fingerprint
  appears in the title as `[qg-xxxxxxxx]` and again in an HTML comment in the
  description.
- Before filing, the finder reads every Jovie issue whose title contains
  `[qg-`, including archived ones. Open founder DetectionGaps are refreshed as
  evidence arrives. Completed or canceled matches stay terminal; **a canceled
  issue is Tim's durable "no"** for that subject.
- At most **5** new high-confidence issues per run.
- At most **3** new `quality-gap:needs-tim` issues per UTC day, counted from
  Linear. Extra proposals are deferred to the next run, ranked by
  confidence × impact.

## Event hooks

The workflow accepts `repository_dispatch` with type `quality-gap-scan`.
The Linear webhook route (`apps/web/app/api/webhooks/linear/route.ts`) fires
it when a JOV issue gains a `postmortem-action`, `bug`, `dogfood`, `sentry`,
`intake`, or `escaped-defect` label, or closes while carrying one (a closed
post-mortem action can turn a handled class into a gap). A Tim-authored comment
that explicitly records a founder rescue also fires the same scan.

An issue created in Triage with one of those labels takes the Triage
assessment dispatch instead. The next `apps/web` push to `main` re-runs the
finder, which then reads it. The bug intake loop
(`docs/design-system/BUG_INTAKE_LOOP.md`) may also fire the dispatch when it
files a Linear bug.

## Summer handoff: instruction for summer-config

Add this bullet to Summer's instructions in `JovieInc/summer-config`, in the
inbox or cards section:

> - **Quality-gap cards for Tim.** For each open Jovie Linear issue labeled `quality-gap:needs-tim` whose title starts with `[qg-`, create exactly one Ovie card via `POST /api/internal/ovie/summer-cards`. Use `idempotencyKey` = the fingerprint from the title (for example `qg-1d9baa3d`), `kind: "decision"`, `product: "jov"`, and `title` = the issue title without the `[qg-…] Quality gap: ` prefix (≤120 chars). The `body` is the issue's Evidence and Suggested guardrail sections. The `recommendation` is your own one-line call on whether the guardrail is worth adding. Set `defaultIfSilent: "Stays in Backlog; not re-proposed"` and `evidence` = [the Linear issue URL]. On **approve**, move the issue to Todo, add `quality-gap` (and `agent-ready` if the suggestion is mechanical: a test, story, budget entry, or CI wiring), and remove `quality-gap:needs-tim`. On **reject**, cancel the issue and put Tim's comment in it. The finder never re-proposes a canceled fingerprint. Never create cards for issues labeled only `quality-gap`; those are high confidence and go through normal dispatch. The finder already caps this lane at 3 new issues a day. Do not add a second cap or batch them.

## Changing it

- Change collectors, confidences, and caps in `scripts/quality-gap-finder.mjs`.
  `scripts/quality-gap-finder.test.mjs` covers each collector, dedupe, the
  daily cap, and a full offline run. It runs in the ci-fast script-contract
  lane.
- Keep the finder deterministic. Model-scored triage belongs in Jev/Summer,
  downstream of the Linear issue, not in this scan.
