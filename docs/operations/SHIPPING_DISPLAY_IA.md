# Shipping display information architecture

The Gem ultrawide HUD and Ovie Ops are different presentations of the same
shipping system. They may differ in density and diagnostics, but they must not
rename or visually reinterpret the shared operational concepts below.

The source contract remains `ovie.shipping-state.v1`. The Gem HUD may read the
official Symphony API directly for higher-cadence worker detail; that does not
authorize a second meaning for any field.

| Concept | Canonical label | Default representation | Context that travels with it |
|---|---|---|---|
| Worker capacity | Agents | Active workers over configured limit | Available capacity when measured |
| Token throughput | Throughput | Token rate | Measurement window or unavailable state |
| Remediation failure | Failures | Count plus inspectable list | Issue ID, attempt, error, retry timing |
| Token use | Tokens | Total scalar | Per-work-item token count in current work |
| Merge queue | Queue | Count | Pull-request identity and queue age where space permits |
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
   failures and blockers are Pulse, queued work is purple, and neutral or
   unknown data is gray. Color never decorates borders or brand chrome.
4. Dynamic states reserve their geometry. Worker, retry, blocked, empty, and
   overflow states must not move the top metrics, shipping path, or footer.
5. Human-facing timestamps use natural relative local language. Exact machine
   timestamps stay in source receipts or drill-down, not the scan-first view.
6. Gem-only diagnostics may include workspace path, attempt, turn, runtime,
   and local endpoint health. Ovie may omit those for space or authorization,
   but must not substitute a conflicting meaning.
7. Ovie may add founder decisions and authorization-aware actions. The Gem HUD
   remains read-only and shipping-heavy.

## Review rubric

- Do Gem and Ovie use the canonical label and default representation?
- Does every count distinguish measured zero from unavailable?
- Does each current-work item retain ID, state/title, tokens, and elapsed time
  wherever those fields are meaningful?
- Do error, empty, busy, and overflow fixtures retain identical frame geometry?
- Is every surface-specific omission explained by cadence, diagnostics,
  authorization, or available space?
