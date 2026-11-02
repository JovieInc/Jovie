# Generative views: voice-composed, saved dashboards (research memo, 2026-10-29)

Status: **proposal**, research only, no code. Owner of the decision: Tim (taste),
Summer (build). Scope: Ovie first; Jovie for artists is explicitly held (see
[Verdict](#1-verdict)).

The question Tim asked: rather than hand-building dashboard pages, should Ovie
have a system where he tells Summer, over full-duplex voice, what he wants to
see, watches her build the view, and pins it to the sidebar with no code
change? Is it worth it, and where does it break?

Repo evidence read for this memo (origin/main `9813d6596`):
`apps/web/lib/home-loop/contract.ts`, `apps/web/lib/ovie/ops-card.ts`
(`summer.ops-card.v1`), `apps/web/lib/ovie/home/canvas-turns.ts`,
`apps/web/components/organisms/home-loop/*`,
`apps/web/lib/voice-gateway/realtime-session.ts` (JOV-5920),
`apps/web/components/organisms/operator-navigation.ts`,
`apps/web/lib/db/schema/ovie.ts`, `canon/PRODUCT.md`, and the in-flight
data-architecture ADR in `~/wt/jv-dataarch`
(`docs/architecture/data-architecture-adr-2026-10-29.md`). gbrain search for the
proof-stat registry returned no page yet (`feat/proof-stat-registry` has no
commits ahead of main), so the registry is treated here as a contract this work
consumes, not something it defines.

## 1. Verdict

**Worth it, for Ovie, if it is "compose from canonical blocks bound to
registered metrics" and never "the model writes UI or queries".** Ship a thin
Ovie-only slice (section 4) in about 7 to 9 agent-days. Views live on the
main cinematic canvas (JOV-9748): voice drives them, pinning saves them.

Why it is worth it:

- The pieces already exist. Ovie Home renders validated `summer.ops-card.v1`
  cards from Summer tool output (`canvas-turns.ts`), the home-loop contract
  already defines the block shapes (tile, row, strip, latency, constraint,
  done), and the voice gateway already has exactly-once action keys. A view
  spec is the missing noun that lets a canvas turn persist.
- Ovie has about 40 operator routes under `app/(shell)/admin`, most of them
  read-only metric pages. Each costs a PR, a story, a test and upkeep. A view
  that Summer composes in under 10 seconds is cheaper than any of them, and it
  follows Tim's agent-first preference (a button that starts a conversation
  beats a settings page).
- Industry evidence points one way: AI answers over a governed semantic layer
  are reliable; AI writing raw SQL or UI code is not (section 1a).

Where the scope stops:

- **Not for Jovie artists yet.** `canon/PRODUCT.md` classifies "knobs,
  pickers, dashboards" as configurability/tooling: **Hold** until 3 distinct
  paying Pro asks, and rule 2 bans fiddle surfaces. The artist-side use of the
  same engine is different: Jovie chooses and generates the Home/empty-state
  layout for the artist (already decided, 2026-10-28). That reuses the
  catalog and compiler without giving artists a dashboard builder.
- **Not a second navigation tree.** "Ovie is one Home" (2026-10-21) fixes the
  nav at Home plus one collapsed Tools group. Pinned views live inside Tools,
  capped (proposed: 7), and each pinned view must either replace a
  hand-built page or expire. Otherwise this rebuilds the sprawl the IA decision
  removed.
- **Read-only views.** Views display metrics and may carry existing one-click
  asks. They never introduce new write flows, forms, or settings.

Decision record: **Ship now:** Ovie-only slice in section 4. **Re-evaluate
when:** 30 days after the slice ships, or when 10 views are pinned. **Then:**
if at least 3 pinned views are opened weekly and at least 3 hand-built Tools
pages were deleted in their favor, extend the catalog and start the deletion
list; if fewer than 3 views are opened weekly, freeze at the slice and keep
the canvas as a transient answer surface only.

### 1a. Prior art: what worked and what did not

| Approach | Examples | Outcome | Lesson for us |
|---|---|---|---|
| Model streams real components/code | Vercel AI SDK RSC `streamUI` | Vercel paused AI SDK RSC development and points users to AI SDK UI with typed tool parts ([migration guide](https://ai-sdk.dev/docs/ai-sdk-rsc/migrating-to-ui), [template notice](https://vercel.com/templates/ai/rsc-genui)) | Server-streamed components couple model output to the render tree and are hard to persist or replay. Persist data, not components. |
| Model emits JSON constrained to a registered catalog | [vercel-labs/json-render](https://github.com/vercel-labs/json-render) (Zod-validated catalog, streaming patches), Google [A2UI](https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec) (JSON Schema catalog, agent may only use approved components, no executable code), [Thesys C1](https://docs.thesys.dev/guides/what-is-thesys-c1) (typed UI DSL rendered by its React SDK) | Converging industry pattern in 2026 | This is our `summer.ops-card.v1` approach already. Keep it, generalize it to a layout of blocks. Do not adopt a vendor DSL: C1 renders its own Crayon design system, which conflicts with our tokens. |
| Prompt-to-app code generation | Shopify Sidekick custom apps ([changelog](https://changelog.shopify.com/posts/create-custom-apps-with-sidekick); merchants cannot see the generated code), [Retool AppGen](https://retool.com/ai-app-generation) | Works for one-off internal tools; output is code that must be maintained | Code generation gives you a new thing to review, test and migrate. Sidekick constrains it to Polaris components and the Admin API, which is the same lesson: a fixed design system plus a governed data API. |
| LLM writes SQL | Raw text-to-SQL | 32.7% to 64.5% on a realistic schema versus much higher with a semantic layer ([dbt Labs, 2026](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026)); +17 to 23 points from semantic grounding across three frontier models ([arXiv 2604.25149](https://arxiv.org/pdf/2604.25149)); Snowflake Cortex Analyst 52% to 83% on one dataset ([Atlan summary](https://atlan.com/know/snowflake/cortex-analyst-vs-text-to-sql/)) | Never let the model write SQL. A wrong number in front of the founder is worse than no number. |
| LLM emits a structured query against a semantic layer | [Cube AI API](https://cube.dev/blog/a-practical-guide-to-getting-started-with-cubes-ai-api) (generates a Cube JSON query, compiler writes SQL), [dbt Semantic Layer](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026) (98 to 100% on the ACME benchmark), [Lightdash agents](https://docs.lightdash.com/guides/ai-agents.md) (metrics/dimensions from the semantic layer, project permissions apply), [Omni Blobby](https://mcpservers.org/zh-CN/agent-skills/exploreomni/omni-ai-optimizer) (only topics listed in `ai_chat_topics`, curated `ai_fields`, sample queries), [Hex semantic models](https://learn.hex.tech/docs/connect-to-data/semantic-models/intro-to-semantic-models), [Metabase Metabot](https://www.metabase.com/docs/latest/ai/metabot) (sees only what the user can see) | The approach that works | Our version: the model picks registered metric ids plus allowed parameters; a deterministic resolver produces the number. Omni's allow-list and sample-query pattern maps to "metrics are exposed to Summer explicitly, with example utterances". |
| Saved filtered views | [Linear custom views](https://linear.app/docs/custom-views.md) (save any filter as a view, workspace or team scope, "Filter with AI" turns phrases into filters), Notion database views | Durable, loved, low-maintenance | A saved view should be a small declarative filter/layout over stable primitives. That is why Linear views do not rot: the primitives (issue fields) are versioned by Linear, not by the view. |

Research gap: `jovie research` returned no results (Exa/Firecrawl had no
credentials; logged as a tooling gap), so sources above came from web search.
Several Omni and A2UI sources are secondary mirrors; the claims used here
(allow-listed topics, catalog-only components) match the vendors' own
positioning.

## 2. Architecture sketch

### 2.0 Frame: the canvas hosts views, voice drives them, pins save them

Tim's vision addition on 2026-10-29 ([JOV-9748](https://linear.app/jovie/issue/JOV-9748),
latest comment) sets the frame: the main content area is a living, transforming
cinematic canvas, not a stack of fixed pages. The Jovie circle spins up and
animates into the composer, and compacts back to a circle during full-duplex
voice. Generated views appear on that canvas live while Tim talks.

This memo's architecture maps onto that frame with three roles:

| Role | Surface | Owner |
|---|---|---|
| **Host** | The main content canvas. A view spec is one canvas state; Home is the default canvas state. | Shell/IA lead (`~/wt/jv-appshell`) owns the canvas container and rim (JOV-4744); this work owns what renders inside it. |
| **Driver** | Voice through the realtime gateway, with the O ↔ composer ↔ compact-circle presence. Typing in the composer is the same tool path. | Brand/motion owners (JOV-7760, JOV-8176) own the O and composer morph; Summer owns the tool calls. |
| **Memory** | Pinning saves the current canvas state as a view in the sidebar. Opening a pinned view restores that canvas state. | Saved-views registry (2.4) plus the shell's nav (2.5). |

The consequence for the design: there is no "view page" that differs from
the canvas. `/app/ov/views/[id]` is only a deep link that opens the canvas in
that state. Composing, patching, pinning and reopening are all transitions of
one surface, which is what makes the motion grammar in 2.8 possible.

```
 Tim (voice / composer)
   │  utterance
   ▼
 Summer (realtime gateway JOV-5920, exactly-once action keys)
   │  tool call: view.compose / view.patch / view.pin ...
   ▼
 Intent model (cheap, structured output)  ──►  ViewIntent (metric ids + hints)
   │
   ▼
 View compiler (deterministic, pure)  ──►  ViewSpec jovie.view-spec/v1
   │   uses: Block catalog + Metric registry (proof-stats)
   ▼
 Main canvas morphs to draft (2.8) ──►  pin   ──►  Saved-views registry
                                                         │
                                       Shell sidebar (Tools ▸ Views) ◄──┘
```

### 2.1 View spec as data

One versioned, Zod-validated document. It is the only thing persisted.

```ts
// jovie.view-spec/v1 (sketch)
{
  schema: 'jovie.view-spec/v1',
  id: 'view_01J…',
  title: 'Merge throughput, 14 days',
  persona: 'ovie',                 // 'jovie' reserved, held by canon
  catalogVersion: 3,               // block catalog version it compiled against
  layout: 'fit',                   // no-scroll fit, same as Home ("+N more")
  blocks: [
    { id: 'b1', kind: 'tile',   bind: { metric: 'ship.merges', window: '24h', compare: 'previous' } },
    { id: 'b2', kind: 'series', bind: { metric: 'ship.merges', window: '14d', grain: 'day' } },
    { id: 'b3', kind: 'latency', bind: { metric: 'ship.stage_latency', window: '7d' } },
  ],
  provenance: { utterance: 'show me merges per day for two weeks', model: '<id>', composedAt: '…' },
  versions: [ /* prior specs, restorable */ ],
}
```

No markup, no CSS, no copy beyond the title and per-block label overrides
(which pass the `@jovie/copy` lint like any other UI string). No SQL, no URLs
the model invented.

### 2.2 Block catalog (reuse, do not invent)

Each catalog entry is `{ kind, propsSchema, accepts, renderer, states }`.
`accepts` names the binding shape (scalar, series, rows, latency table). The
first catalog is entirely existing code:

| kind | Renderer (exists) | Contract type (exists) | Accepts |
|---|---|---|---|
| `tile` | `HomeLoopPulse` | `HomeLoopTile` (`was`, `measured`, tone) | scalar metric |
| `strip` | `HomeLoopStageStrip` | `HomeLoopStripItem` | 2 to 6 scalars |
| `rows` | `HomeLoopStageRows` / `HomeLoopKanban` | `HomeLoopRow` | row-set metric |
| `latency` | `HomeLoopLatency` | `HomeLoopLatencyRow` (p50/p95/regressed) | stage-latency metric |
| `card` | ops-card renderer | `summer.ops-card.v1` (facts + series) | facts and/or series |
| `asks` | `HomeLoopAsks` | `HomeLoopAsk` (5 s undo already built) | ask-set source |

Missing in v1 and worth adding later: a dedicated series/sparkline block and a
table block. Both are added as DS components first (Storybook story, state
coverage, tokens only), then registered. The catalog is the design-system
boundary: if it is not in the catalog, a view cannot show it.

### 2.3 Metric bindings and the query DSL

The binding is the safe query DSL. Its whole grammar:

```
bind := { metric: MetricId, window?: Window, grain?: Grain,
          filter?: { [dimension in metric.dimensions]: AllowedValue },
          compare?: 'previous' | 'none', limit?: 1..24 }
```

- `MetricId` must exist in the metric registry. The registry is the proof-stats
  registry (`~/wt/jv-proofstats`, branch `feat/proof-stat-registry`) extended
  with what a view needs. Each entry carries: id, label, unit/format, shape
  (scalar, series, rows), resolver (a server function), allowed windows,
  grains and dimensions, `cacheTag`, freshness SLO, owner, `audience`
  (`operator` | `creator`), sensitivity, status (`active` | `deprecated` with
  `replacedBy` | `retired`), and 2 to 5 example utterances (the Omni
  sample-query idea, used for retrieval and evals).
- `canon/sources-of-truth.json` stays the owner map. The registry derives from
  it and never copies a value (single-source-of-truth rule).
- Resolvers return the existing measurement shapes (`value | null` plus state),
  so "Not measured" is preserved end to end. A missing number is never a zero.

### 2.4 Saved-views registry

- Slice 1: rows in the existing `ovie_operating_kv` table, key
  `ovie:view:<id>`, value = the spec with its version list. No migration,
  survives instance hops, and admin-only by the route that reads it.
- Later, if views go multi-user or reach Jovie: a dedicated `views` table
  (owner, persona, tenant scope, spec jsonb, catalogVersion, pinnedAt,
  lastOpenedAt) through the normal Drizzle migration path.
- History: every compose/patch appends a version; "restore" is a pointer move,
  matching the "restorable history" decision for the living canvas.

### 2.5 Sidebar pinning in the canonical shell

- The shell owns navigation (`operator-navigation.ts`, `UnifiedSidebar`,
  `CmdKPalette`); this work only supplies data. The shell lead in
  `~/wt/jv-appshell` (branch `design/app-shell-canon`) decides placement. The
  proposal to them: a "Views" subsection inside the collapsed Tools group,
  capped at 7, ordered by last opened, each also in Cmd-K.
- Route: one dynamic page, `/app/ov/views/[id]`, rendering any spec. Pinning
  adds no route and no code.
- Pins expire: a view unopened for 30 days is unpinned (kept in history,
  restorable by voice). This keeps "one Home" honest.

### 2.6 Summer's tool calls

| Tool | Effect | Reversible | Confirmation |
|---|---|---|---|
| `metric.search(q)` | Returns matching registry entries | n/a | none |
| `view.compose(intent)` | Draft spec, formed live on the main canvas | yes (draft) | none; Summer reads back what she chose |
| `view.patch(id, ops)` | JSON-patch on blocks (swap metric, window, order, remove) | yes (version) | none |
| `view.pin(id)` / `view.unpin(id)` | Sidebar placement | yes | act, then 5 s undo |
| `view.restore(id, version)` | Pointer move | yes | none |
| `view.delete(id)` | Soft delete | yes for 30 days | act, then 5 s undo |

All tools are idempotent under the gateway's exactly-once action keys, so a
replayed transcript after a provider failover cannot double-pin.

### 2.7 The cheap-model-plus-compiler split

The model decides **what** (which metrics, which window, roughly how many
blocks). The compiler decides **how** (block kind per metric shape, order,
grid fit, labels, empty states). Concretely:

1. Intent model gets the utterance, the registry index (ids, labels, example
   utterances; cached prompt prefix) and returns `ViewIntent` via structured
   output: `{ title, metrics: [{ id, window?, grain?, filter? }], emphasis? }`.
2. Compiler validates every id and parameter against the registry. Unknown id:
   the tool returns the 3 nearest registry matches and Summer asks or picks.
   It never guesses a new metric.
3. Compiler maps shape to block (scalar → tile, series → card series,
   latency → latency, rows → rows), applies the fit layout, and emits the spec.

This makes design consistency structural rather than reviewed, and makes the
expensive model optional for this step.

### 2.8 Motion: transitions between views inside the canonical choreography

Motion follows the existing grammar; this work adds no new motion system.
Sources: `.claude/rules/motion.md` (System B tokens, frequency rule, no
`ease-in`, no raw values), JOV-8176 (state choreography: pill compacts to a
perfect circle, resolves to check or re-expands to error; interruptible;
stale completions cannot reset newer state; reduced motion substitutes state
without travel) and JOV-9748 (circle → capsule → rounded rectangle; surface
size follows the task; clockwise circulation means activity).

**The model never chooses motion.** The renderer diffs the previous spec
against the next one by stable block id and gets four sets: enter, exit, move
(same block, new slot), update (same block, new data). Each set maps to fixed
tokens. Motion is therefore deterministic, testable, and identical whether
the change came from voice, typing or a restore.

| Moment | Choreography | Tokens / owner |
|---|---|---|
| Tim starts talking | The O compacts from composer capsule to the compact voice circle (JOV-9748 presence). The canvas stays put; nothing moves until there is something to show. | Brand O owner; `--ease-cinematic`, `--duration-cinematic` |
| Summer is composing | The O's clockwise circulation is the only activity signal (JOV-8177 truthful status ring, bound to the real `view.compose` call). No fake skeleton progress. | JOV-8177 |
| Draft appears | The canvas morphs from its current state to the draft. Persisting blocks move in place (FLIP); new blocks enter with opacity and a short rise from their own slot, never scale from zero; exiting blocks leave faster than entries. Slots are reserved from the compiled spec before data arrives, so there is no layout shift. | `--ease-out` for enter, `--ease-in-out` for move, `--duration-slow` |
| Block data resolves | Same-frame skeleton-to-content swap (JOV-8180), no reflow. | `--duration-instant` |
| Live metric update | Only changed digits tick (JOV-8181 changed-only ticker, no initial zero roll). No block or layout motion for data updates. | JOV-8181 |
| Patch ("no, weekly") | Only the affected block updates or moves. Barge-in mid-transition retargets from the current painted position; a stale compose result is dropped by spec version, as JOV-8176 requires for stale completions. | same as draft |
| Pin | The view title capsule travels to its new sidebar item (origin-aware), with the quiet undo fuse for 5 s (JOV-8178). Keyboard-initiated pin: no travel, instant state change. | `--duration-cinematic`; JOV-8178 |
| Open a pinned view / return Home | Whole-canvas morph between two canvas states, shared blocks continuous, others cross-fade. | `--duration-cinematic`, `--ease-in-out` |
| Error or retired metric | The block resolves to its explicit error state with a working repair action; no automatic fake success. | JOV-8176 error re-expand |
| Reduced motion | Every row above becomes immediate state substitution; opacity kept where it aids comprehension, translation removed. Tokens zero out centrally. | `design-system.css` |

Frequency check (motion rule section 1): patches can happen tens of times in a
session, so block-level morphs stay at `--duration-slow` or below; only whole
canvas changes (open view, return Home) use the cinematic duration. Hidden
tabs and offscreen canvases do not animate.

Test hooks: the spec diff is a pure function, so enter/exit/move/update sets
get unit tests; Storybook interaction stories cover draft → patch → pin →
undo → reopen, with rapid interruption and reduced motion, certified through
the JOV-7713 UI assurance system rather than a new gate.

## 3. Gotchas and mitigations

| # | Gotcha | What goes wrong for us | Mitigation |
|---|---|---|---|
| G1 | **Correctness** | The model invents a metric, a window, or a computation; Tim acts on a wrong number. | No SQL, no arithmetic in the model. Only registry metrics with server resolvers. Every block shows source and `observedAt` on hover, as ops-cards already do. Unknown metric means "I don't have that metric yet" plus an auto-filed capability gap (with example utterance), never an approximation. |
| G2 | **Two definitions of one metric** | A view's "merges/day" differs from Home's. | Home tiles and view tiles resolve through the same registry entry. The proof-stats registry is the only owner; a CI check fails if a Home tile or view binds a metric not in it. |
| G3 | **Permissions (Ovie)** | An operator view exposes data a future non-founder operator should not see. | Views render only under the existing admin page guard. Each metric declares `audience` and `sensitivity`; the resolver checks the session, not the spec. |
| G4 | **Tenancy (Jovie, later)** | A spec authored for one artist leaks another artist's data. | Specs are tenant-agnostic: they hold metric ids, never tenant, profile or user ids. Tenant comes from the session inside the resolver, under RLS (ADR D5). Filters may only use declared dimensions with server-validated values. A cross-tenant fixture test is a precondition for any Jovie use. |
| G5 | **Prompt injection via data** | A row title or ask text read by the model steers it into composing something else. | The intent model sees the utterance and registry metadata only, never resolved data. Tools that mutate are limited to view operations. |
| G6 | **Design drift** | Generated views look unlike the product. | Catalog-only rendering, tokens only, no free-form markup or colors. Every catalog block has Storybook stories and state coverage (fresh, stale, Not measured, error). A new block enters the catalog through the DS process, not through a view. |
| G7 | **Saved-view rot** | A metric is renamed or retired, or a block's props change; old views break or, worse, render wrong numbers silently. | (a) Specs record `schema` and `catalogVersion`. (b) Migrations are pure functions `vN → vN+1`, each with fixtures, run on load and written back. (c) The registry deprecates with `replacedBy`; the loader rebinds automatically and notes it in history. (d) A retired metric renders a block stating that and offering "Ask Summer to repair" (a working path, so not a dead end under rule 6). (e) A CI job validates every saved spec (exported from KV as fixtures) against the current catalog and registry, and a nightly job validates live specs and files one Linear issue per broken view by fingerprint. |
| G8 | **Performance** | A live view refetches everything every few seconds; 7 pinned views hammer Neon. | Each block's data is a `'use cache'` read tagged with the metric's `cacheTag` (ADR D1). Writes invalidate only that tag (D2). Live updates arrive as SSE events and refetch only the affected block's TanStack Query key (D3, D7). No polling, no whole-view reload, no `router.refresh()`. Blocks render server-side for first paint with a reserved, layout-stable slot. |
| G9 | **Voice latency** | Tim speaks, silence, then a jump. | Budget: spoken acknowledgement under 800 ms from end of utterance (industry ceiling for natural turn-taking, [Twig](https://www.twig.so/blog/voice-ai-agents-latency-budget-800ms)); skeleton blocks within 1 s; first resolved block within 2 s p50, 4 s p95. Summer narrates the choice ("Merges per day, last 14 days") while blocks stream in. Under failover the gateway's ladder (resume, failover, push-to-talk, text) applies unchanged. |
| G10 | **Voice confirmation and undo** | Mishearing "pin" or "delete"; confirmation prompts slow everything down. | All view operations are reversible, so none needs a confirmation prompt. Read-back of the composed view is the confirmation. Pin, unpin and delete act at once with the canvas 5 s undo and a spoken "undo" that cancels within the window. Barge-in ("no, weekly") becomes a `view.patch`. |
| G11 | **Cost** | Every utterance runs a large model. | The cheap-model-plus-compiler split (2.7). Estimated per compose: about 3k cached input tokens (registry index) plus about 300 output tokens, a fraction of a cent at small-model rates, small next to Summer's own turn. Track `view.compose` spend in the existing cost ledger (`lib/ovie/cost-ledger`) with a per-day cap. Evals run on Workers AI per the helpfulness-eval decision. |
| G12 | **Ambiguity** | "Show me growth" maps to six metrics. | The compiler returns candidates; Summer picks the one used most in pinned views or Home, says which, and offers the alternatives in one sentence. Ambiguous utterances become eval cases. |
| G13 | **Sprawl** | 40 pinned views replace 40 pages; nothing improved. | 7-pin cap, 30-day expiry, and a rule that a hand-built read-only page with a pinned equivalent is a deletion candidate (section 5). Measure pinned-view opens per week. |
| G14 | **Canon conflict for artists** | Shipping a dashboard builder to artists breaks "no fiddle surfaces" and the Hold rule. | Persona `jovie` is reserved in the schema and blocked by a test until canon changes. The artist path is Jovie-chosen layouts, not artist-built dashboards. |
| G15 | **Testing** | Generated surfaces escape regression tests. | Saved views are fixtures (section 4.4); the catalog is the tested surface; the compiler is pure and unit-tested; an utterance eval set scores metric selection. |

## 4. Thin first slice (Ovie only)

**Story:** Tim says "show me X". Summer composes a view from existing blocks
and registered metrics, and it forms live on the main canvas while he talks.
He says "pin it", and it appears under Tools ▸ Views, survives reloads and
deploys, reopens as that canvas state, and updates live.

### 4.1 Scope

1. `lib/views/spec.ts`: `jovie.view-spec/v1` Zod schema, migration runner
   (identity for v1), and `persona: 'jovie'` rejected.
2. `lib/views/catalog.ts`: the six existing blocks in 2.2, each mapped to its
   renderer and binding shape.
3. Metric registry consumption: bind to whatever the proof-stats registry
   exports. If it has not landed, start with about 12 shipping and company
   metrics that Home already computes (merges, PR to merged, stage latency,
   in-flight by stage, asks waiting, AI spend, revenue). Those resolvers exist
   behind Home today, so the slice adds no new data paths.
4. `lib/views/compile.ts`: pure `ViewIntent → ViewSpec` compiler.
5. Summer tools: `metric.search`, `view.compose`, `view.patch`, `view.pin`,
   `view.unpin`, `view.restore`. Each returns an ops-card-style payload, so
   `canvas-turns.ts` renders drafts with no new UI path.
6. Persistence in `ovie_operating_kv`; `/app/ov/views/[id]` as a deep link
   that opens the canvas in that state.
7. Spec-diff renderer: enter/exit/move/update sets mapped to existing motion
   tokens (2.8). The voice O morph itself stays with its brand owner; the
   slice consumes whatever state the O exposes and works with plain text
   input if the voice morph has not landed.
8. Shell hook: the views list exposed as `NavItem[]` for the shell owner to
   place (coordinate with `~/wt/jv-appshell` before merging the nav change).
9. Live updates: block-level refetch on the existing SSE stream where an event
   exists; otherwise the block's cache life, with the reason recorded.

Out of scope for the slice: new block kinds, series/table blocks, multi-user
views, Jovie persona, editing by drag, sharing.

### 4.2 Effort

| Piece | Agent-days |
|---|---|
| Spec, catalog, compiler, unit tests | 1.5 |
| Spec-diff renderer and motion mapping, interaction stories | 1 |
| Metric registry binding (12 metrics) | 1.5 (0.5 if proof-stats has landed) |
| Summer tools and canvas wiring | 1.5 |
| Persistence, view route, nav hook | 1 |
| Fixtures, utterance eval set (30 cases), Storybook states | 1 |
| Coordination, review, preview verification | 0.5 to 1 |
| **Total** | **about 7 to 9** |

### 4.3 Success metrics (stage timestamps keyed by view id)

Pipeline stages, each with entry and exit timestamps recorded: utterance end,
intent returned, spec compiled, first block painted, all blocks painted,
pinned.

| Metric | Target |
|---|---|
| Utterance end to first block painted | p50 ≤ 2 s, p95 ≤ 4 s |
| Metric selection accuracy on the 30-utterance eval | ≥ 90% exact metric ids |
| Composes that end in an invalid spec | 0 (compiler guarantees validity; failures are bugs) |
| Pinned views opened weekly, after 30 days | ≥ 3 |
| Hand-built Tools pages deleted in favor of views, after 30 days | ≥ 3 |
| Cost per compose | logged per call; daily cap alarm |
| Saved specs failing validation on load | 0 in CI; nightly issue otherwise |

These feed Ovie's stage-timing strip like any other pipeline (measure
everything rule).

### 4.4 Saved views as certifiable fixtures

- `apps/web/tests/fixtures/views/*.json`: every pinned spec, plus golden
  specs for each catalog block.
- One Vitest test loads every fixture through the migration runner, validates
  it against the current catalog and registry, and renders it with fixture
  metric data, including the Not measured, stale and retired states.
- A spec that a human has certified (Tim kept it pinned for 14 days) is copied
  into fixtures by a deterministic script, so the views Tim relies on cannot
  regress silently.
- The compiler is property-tested: any valid `ViewIntent` produces a valid
  spec that fits the no-scroll layout.

## 5. What it lets us delete

The criterion: a page under `app/(shell)/admin` that is read-only, shows
metrics that are or can be registered, and has no unique interaction. Such a
page becomes a saved view once its metrics are registered and a pinned view
reproduces it. Candidates from a first pass (route LOC from this audit; most
render feature components elsewhere, so real size is larger):

| Route | Note | Proposed fate |
|---|---|---|
| `costs` | read-only spend display | view, once AI spend and infra cost are registered |
| `capacity` | read-only | view |
| `revenue-lift` | backed by `lib/metrics/revenue-lift-dashboard.ts` | view after its metrics move to the registry |
| `growth` | GTM read-outs | view |
| `activity` | read-only feed | view (`rows`) |
| `ops` | "full operations dashboard, Home's drill-down" (1.4k LOC) | split: metric sections become views; developer controls stay a Tool |
| `operations`, `system` | read-only maps and status | decide with the IA lead; `system` has tabs over skills/connectors/tools that may stay |
| `algorithm-health` | already a redirect | delete now, independent of this work |

Keep hand-built: `shipping` (Home's source, golden for Ovie), `inbox`/asks,
`investors`, `platform-connections`, `playlists`, `waitlist`, `share-studio`,
`chat`/`chat-playground` and anything else with write flows.

This list is input for the Ovie IA worker in `~/wt/jv-ovieia`
(`feat/ovie-ia-canonical`, which is already reworking `activity`,
`operations`, `shipping` and `system`) and the shell lead in
`~/wt/jv-appshell`. It is not a decision. The deletions land as normal PRs after a view has replaced each
page in use.

### Where hand-built pages still win (permanently)

- The Jovie golden path (signup, onboarding, first value) and anything
  certified by screen certification.
- Marketing pages: fully static, content-record driven, cinematic; generated
  layout would break the editorial bar.
- Public artist profiles: one right thing per visitor, already chosen by
  signal, not by a view spec.
- Billing, checkout, auth and settings: write flows with legal and security
  weight.
- Home itself: its skeleton is canon (constraint, asks, in flight, done,
  releases). Views add next to Home; they do not redesign it.

## 6. Coordination with in-flight work

| Work | Owner location | Contract between us |
|---|---|---|
| App shell / IA | `~/wt/jv-appshell` (`design/app-shell-canon`) | They own sidebar placement, Cmd-K and route naming. This work supplies `NavItem[]` and one dynamic route. Proposal: Tools ▸ Views, cap 7. |
| Proof-stat registry | `~/wt/jv-proofstats` (`feat/proof-stat-registry`) | They own metric definitions. Views need these registry fields: shape, resolver, cacheTag, windows, grains, dimensions, audience, status/replacedBy, example utterances. If any are out of scope for them, file them as a follow-up on the registry, not a second registry. |
| Data architecture | `~/wt/jv-dataarch` ADR (accepted) | Views follow D1 to D3 and D7: cached tagged reads, per-tag invalidation, TanStack keys per block, SSE push. No new cache layer. |
| Taste-card redesign | `~/wt/jv-tastecards` | Asks inside views use the same `HomeLoopAsk` contract and card renderer, so the redesign lands in views for free. |
| Living interface / cinematic canvas (JOV-9748), state choreography (JOV-8176) | design lead, brand owner (JOV-7760) | The canvas container, rim and O/composer morph are theirs. Views render inside the canvas and map spec diffs to the existing motion tokens and approved motions (JOV-8177, -8178, -8180, -8181). No new motion primitives. |
| Living canvas (JOV-5959), realtime generative empty states (JOV-9630), voice adapter (JOV-9665) | main | The canvas is the composing surface; the compiler is shared with generated empty states; the voice adapter carries the tool calls. No parallel implementations. |

## 7. Open questions (taste, with defaults)

1. **Where do pinned views sit?** Default: Tools ▸ Views, cap 7. Ships with the
   slice unless the IA lead decides otherwise first.
2. **Should a view be able to replace a Home section?** Default: no. Home's
   skeleton is canon; views live beside it.
3. **Auto-expiry at 30 days unopened.** Default: on.
