# Shipping display information architecture

The Gem ultrawide HUD and Ovie Ops are different presentations of the same
shipping system. They may differ in density and diagnostics, but they must not
rename or visually reinterpret the shared operational concepts below.

The source contract remains `ovie.shipping-state.v1`. Its `operationalTasks`
feed is the one task projection: stable `linear:JOV-*` identity, shared workflow
states and deltas, and explicit local-cache freshness. Ovie and the Gem terminal
board are presentation adapters. A Gem adapter may ingest the official Symphony
API at higher cadence, but it must publish or consume this task contract rather
than invent a second task model.

| Concept | Canonical label | Default representation | Context that travels with it |
|---|---|---|---|
| Worker capacity | Agents | Active workers over configured limit | Available capacity when measured |
| Token throughput | Throughput | Token rate | Measurement window or unavailable state |
| Remediation failure | Failures | Count plus inspectable list | Issue ID, attempt, error, retry timing |
| Token use | Tokens | Total scalar | Per-work-item token count in current work |
| Merge queue | Queue | Count | Pull-request identity and queue age with a same-class p95 cue where space permits |
| Pull-request flow | PR flow | Open now plus opened and merged in the rolling prior 24 hours | GitHub freshness and collection cost |
| System pressure | System pressure | Thresholded CPU/load, memory, root-disk capacity, I/O, network, and worker-slot projection | Per-metric source, unit, freshness, and explicit normal, amber, red, stale, error, or unknown state |
| CI state | CI matrix | Bounded work-item rows by meaningful check-group columns | Cached server-side aggregate freshness, query cost, and drill-down authority |
| Shipping latency | Ship | Segmented stage bar | Count and p95 for each measured stage |
| Active execution | Current work | Receipt table or semantically equivalent list | Issue ID, title/state, tokens, elapsed time |
| Source freshness | Updated | Natural relative local time | Exact source receipt remains available in drill-down |

## Invariants

1. A shared metric keeps the same label, hierarchy, and representation across
   Gem and Ovie. A segmented shipping path does not become an unrelated chart;
   a token total does not silently become cost.
2. Missing measurement is unknown, never zero. Stale, disconnected, degraded,
   and unauthorized states remain explicit.
3. Status color is semantic and redundant with text or glyph: active is Ion,
   healthy is Mint, warnings are Orange, failures and blockers are Red,
   pending work is Ultra, and neutral or unknown data is gray. Color never
   decorates borders or brand chrome.
4. Dynamic states reserve their geometry. Worker, retry, blocked, empty, and
   overflow states must not move the top metrics, shipping path, or footer.
5. Human-facing timestamps use natural relative local language. Exact machine
   timestamps stay in source receipts or drill-down, not the scan-first view.
6. Gem-only diagnostics may include workspace path, attempt, turn, runtime,
   and local endpoint health. Ovie may omit those for space or authorization,
   but must not substitute a conflicting meaning.
7. Ovie may add founder decisions and authorization-aware actions. The Gem HUD
   remains read-only and shipping-heavy.
8. Ovie consumes the same authenticated cached pressure and CI projection with
   the same labels, status colors, and matrix grammar. It must not duplicate
   provider polling, expose host-private diagnostics, or import collector
   machinery; founder summary and drill-down are a separate bounded consumer.
9. Linear is canonical for operational tasks. Ovie never waits on a live Linear
   request: it renders the latest locally reconciled projection immediately,
   retains it through sync failures, and labels `fresh`, `stale`, `syncing`, or
   `failed`. Terminal-only workspace and attempt details are adapter additions,
   not changes to task identity or workflow meaning.

## Operator hierarchy and responsive frames

The Gem HUD is a scan-first operator console. Its vertical order is stable:

1. `OPERATOR HEALTH` — one bounded band that names the highest-severity
   actionable conditions. Critical and stalled work is named in text, never by
   color alone.
2. Operator-action heroes — `AGENTS`, `FAILURES`, `QUEUE`, and `CI FAILURES`
   receive the strongest bounded block treatment. Throughput, token totals,
   runtime, and provider limits remain a secondary telemetry line because they
   do not independently determine the next operator action.
3. `PRIMARY CAPACITY / PRESSURE` — CPU/load, memory, root-disk capacity, I/O
   full PSI, network, and worker slots with fixed-width gauges and visible
   source/unit/window/denominator/freshness contracts.
4. `CURRENT WORK` — blocked, retrying, running, and queued receipts in that
   severity order.
5. `SHIP`, `PR FLOW`, and `CI MATRIX` — delivery progress and bounded
   diagnostics.
6. `BUSINESS SIGNALS` — lower-frequency receipts that never displace operator
   health or current work.

The 430×90 frame renders the full hierarchy. Medium-height wide frames retain
the health band, heroes, pressure, full receipt columns, and ship path while
omitting lower-priority CI and business diagnostics. Frames narrower than 160
columns use the compact receipt grammar; 120×40 retains PR flow, while 80×24
retains operator health, every primary pressure metric, current work, and ship
state. Every supported frame is exactly padded to its requested width and
height across unavailable, constrained, critical, empty, and overflow states.

The top corner uses the public product label `JOVIE · SYMPHONY`; below 120
columns it collapses to `JOVIE` before it can displace operational content.

Live refresh assembles the complete next frame off-screen, then emits
cursor-home plus the frame in one flush. A full terminal clear occurs only on
the first frame or after a geometry change, so a five-second data refresh does
not flash the tty. If Symphony, merge-queue, Linear, or pressure collection
fails after a good sample, the in-process source cache retains the last good
values, preserves their original freshness age, and marks the source
`STALE/ERROR` in text. The previous frame remains visible throughout the slow
or failed collection attempt. The service emits a bounded refresh receipt on
the first frame and every twelfth frame with render latency, terminal-write
latency, geometry, whether a clear was required, and the continuity contract.

The focused structural/golden contract is repeatable with:

```bash
python3 scripts/hermes/tests/gem-checkin-hud.test.py
```

## Pressure thresholds

The Gem collector evaluates sources independently. Disk capacity and I/O stall
pressure are separate metrics and never share a status. A single process is
never treated as host health. Each value carries its source, unit, sample time,
and a text or glyph cue in addition to color. If one pressure metric fails
while the others remain fresh, only that metric retains its last good value and
is marked stale; fresh sibling metrics continue updating.

| Signal | Source and unit | Normal | Amber | Red | Unknown / stale |
|---|---|---:|---:|---:|---|
| CPU | `getloadavg` plus `/proc/pressure/cpu`; load/PSI percent | max(load per core, CPU PSI some avg10) < 75% | 75–124% | >= 125% | Neither source measured, or the source errored |
| Memory | `/proc/meminfo` plus `/proc/pressure/memory`; available/PSI percent | available >= 20% and PSI some avg10 < 10% | available 10–19% or PSI 10–29% | available < 10% or PSI >= 30% | Neither source measured, or the source errored |
| Root disk capacity | `shutil.disk_usage('/')`; capacity percent | available >= 15% | available 5–14% | available < 5% | Capacity unavailable or source errored |
| I/O pressure | `/proc/pressure/io`; full avg10 stall percent | full avg10 <= 10% | full avg10 > 10% and < 20% | full avg10 >= 20% | Full PSI unavailable or source errored; some PSI remains informational |
| Network | `/proc/net/dev` plus `/sys/class/net`; Mbps/link percent | measured link utilization < 60% | 60–84% | >= 85% | Fewer than two bounded samples or link speed unavailable |
| Worker slots | Symphony state; active/configured percent | < 75% | 75–94% | >= 95% | Active count or positive configured capacity unavailable |

Network remains unknown until two host-counter samples create a bounded rate
window and link speed is available. Blank pressure and CI cells are unknown,
never healthy. The GitHub projection is cached for 60 seconds, may serve a
clearly marked stale result for at most five minutes, records collection cost,
and uses one server-side aggregate plus bounded rollups for at most ten recent
open and ten recent merged PRs. The HUD renders at most eight rows; deeper
detail remains a drill-down.

## Queue-age baseline

Queue age is compared only with the historical p95 for the same stage and work
class. A merge-queue row may show a normal or red cue only when the baseline has
at least 20 positive observations, includes a sample timestamp, and is no more
than five minutes old. Age below the verified p95 is normal; age at or above
the verified p95 is red. Insufficient, missing, wrong-class, or stale baselines
render `UNMEASURED` or `STALE`, never a favorable state. The current collector
does not synthesize merge-queue duration history; until a qualifying receipt is
present, merge-queue age remains explicitly unmeasured.

The Ovie consumer is intentionally not part of the collector slice. It starts
only after the cached projection has an authenticated API boundary with
freshness and authorization contract tests; Ovie must consume that projection
rather than poll GitHub or Gem directly.

## Review rubric

- Do Gem and Ovie use the canonical label and default representation?
- Does every count distinguish measured zero from unavailable?
- Does each current-work item retain ID, state/title, tokens, and elapsed time
  wherever those fields are meaningful?
- Do error, empty, busy, and overflow fixtures retain identical frame geometry?
- Is every surface-specific omission explained by cadence, diagnostics,
  authorization, or available space?
