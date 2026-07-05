# Spike: go/no-go on Vercel `eve` agent SDK fit

> Recon spike for [#12499](https://github.com/JovieInc/Jovie/issues/12499); parent epic
> [#12498](https://github.com/JovieInc/Jovie/issues/12498) (adopt `eve` as the Jovie **product**
> agent layer — the artist-facing agent, *not* the internal ops stack). Writeup only; no runtime
> code changed. Evidence captured 2026-06-29.

## Verdict: **conditional GO**

Adopt `eve` as the concrete **`AgentHarness` implementation** behind the interface we already own
(`apps/web/lib/agents/agent-harness.ts`), behind a feature flag, pinned to an exact version, with
skills/tools authored as portable TS/MD we own. **Do not** take `eve`'s Vercel-Workflows durability
for customer-facing product workflows — keep Trigger.dev per ADR [#9871](https://github.com/JovieInc/Jovie/issues/9871).
**Do not** touch the internal AgentOS control plane — ADR [#8191](https://github.com/JovieInc/Jovie/issues/8191)
is unaffected. The one real blocker on a *full* rip-and-replace is **maturity, not architecture**:
`eve` is 13 days old and pre-1.0 (see Q4) — so first contact must be a thin throwaway skill on a
frozen pin, **not** the durable memory loop (see migration sketch).

Net: full-send on decomposition of #12498, scoped to "`eve` as harness, behind a flag" — not
"`eve` owns the runtime."

---

## What `eve` actually is (evidence)

Vercel shipped `eve` at Ship London (~2026-06-23): an open-source, **filesystem-first framework for
durable backend agents**. You define an agent as files under an `agent/` directory; `eve` discovers
and compiles them into an **ordinary Vercel project** deployed with `vercel deploy`. Pitch: "like
Next.js for web apps, but for agents" — Markdown for instructions/skills, TypeScript for tools,
durable by default.

Project layout:

```text
agent/
  instructions.md     # always-on system prompt
  tools/*.ts          # typed functions the model can call (plain TS)
  skills/*.md         # procedures loaded on demand (Agent Skills SKILL.md format)
  channels/*          # message channels: HTTP, Slack, Discord, GitHub (web chat opt-in)
  schedules/*         # recurring cron jobs
```

Underpinnings (all existing Vercel primitives): **AI SDK v7 `AgentHarness`** (eve options like
skills/instructions/hooks carry over from it), **Vercel Workflows** (persist + resume session
state), **Vercel Sandbox** (isolated code exec), **AI Gateway** (model routing/fallback — *Jovie
already uses this*), **Vercel Connect** (OAuth/API-key vault), **Vercel Observability**.

Sources: [vercel.com/blog/introducing-eve](https://vercel.com/blog/introducing-eve) ·
[changelog](https://vercel.com/changelog/introducing-eve-an-open-source-agent-framework) ·
[docs/eve](https://vercel.com/docs/eve) · [github.com/vercel/eve](https://github.com/vercel/eve).

---

## The 5 gating questions

### 1. Surface fit — runtime, or web chat template? → **GO**

`eve` is a **hostable backend agent runtime**, not a Next.js chat template. It deploys as an ordinary
Vercel project; the web surface is **opt-in** (`--channel-web-nextjs` "only when the user wants Web
Chat"). Surfaces are modeled as **channels** — HTTP, Slack, Discord, GitHub ship in-box. Any client
that can hit HTTP (web, iOS, Electron) calls the same runtime; future iMessage / Telegram / WhatsApp
/ Slack are **new channel adapters**, not forks. This does **not** foreclose any backlog surface.

Caveat: the runtime is its own deploy unit (a Vercel project under the `agent/` convention), distinct
from the existing `apps/web` Next.js app. That's an asset for multi-surface reuse but means the
product agent stops being "a function inside the web app" and becomes "a service the web app calls."

### 2. Additive vs. owns-orchestration → **mixed: additive at the SDK layer, opinionated above it**

`eve` builds **on top of** AI SDK v7's `AgentHarness` — the same Vercel AI SDK lineage Jovie already
runs (`ai@^6` today, `@ai-sdk/gateway`, `streamText`, `ToolSet`, `stepCountIs`, `prepareStep` in
`apps/web/lib/chat/run.ts`). At the model/tool primitive level it is **additive**, not a rewrite of
how we call models.

It is **opinionated** about three things above that layer: (a) project structure (the `agent/`
filesystem convention), (b) deployment (its own Vercel project / `vercel deploy`), and (c) durability
(Vercel Workflows). So: adopting `eve`'s **harness** is additive; adopting `eve`'s **runtime +
durability wholesale** is a restructure. Cost of the additive path includes a **one-major SDK bump
`ai` v6 → v7** (eve needs the v7 `AgentHarness`).

### 3. Portability / lock-in → **GO**

Tools are plain TypeScript (`agent/tools/*.ts`); skills are Markdown in the open **Agent Skills
`SKILL.md`** format (same format that works across 18+ agents — Claude Code, Copilot, Cursor, …).
Everything lives in a repo we own; `eve` itself is **Apache-2.0**. The workflow library — the actual
moat — is portable off `eve` by construction.

Lock-in is **low at the skill/tool layer** and **higher only if** we adopt `eve`'s durability
substrate (Vercel Workflows) for product workflows. We already own the decoupling boundary:
`AgentHarness` in `apps/web/lib/agents/agent-harness.ts` (its own comment: *"Future: swap in real
@openai/agents or Vercel AI SDK agent"*). `eve` slots in as `EveAgentAdapter implements AgentHarness`
beside the existing `OpenAIAgentsAdapter` stub — swapping it back out later is an adapter change, not
a refactor.

Honest scope of that boundary: it covers the **memory-loop** path today. The synchronous artist chat
(`run.ts`) bypasses `AgentHarness` and calls `streamText` directly, so it is **not yet** swap-safe —
"we own the swap boundary" is true for the durable memory path, not (yet) for the paying chat path.
That is fine given we keep chat on `streamText` for now (migration step 5).

### 4. Repo health → **vigorously maintained, but pre-1.0 and churning (the real caution)**

Authoritative `gh api repos/vercel/eve` snapshot, 2026-06-29:

| Metric | Value |
|---|---|
| License | Apache-2.0 |
| Created | 2026-06-16 (**13 days old**) |
| Stars | 2,923 |
| Latest release | `eve@0.17.1` (2026-06-29) — **pre-1.0** |
| Release cadence | ~daily (`0.16.0` → `0.17.1` in 3 days) |
| Last push | 2026-06-29 (same day) |
| Open issues | 64 (excl. PRs) |
| Recent commits | hourly; internals being refactored (e.g. "refactor(slack): use chat sdk primitives") |

Read: Vercel is pouring resources in, but this is a **2-week-old v0.x with an API that changes
daily**. Pinning the *paying critical path* to it as-is is the one genuine risk. Mitigation:
exact-version pin, feature flag, and the `AgentHarness` isolation above so churn is contained to one
adapter file.

### 5. Cost + latency in the paying critical path → **no per-token delta; structural cost/latency from durability + fan-out, avoided by keeping chat on `streamText`**

`eve` routes models through **AI Gateway**, which `lib/ai/sdk.ts` already uses (`gateway()`), with the
same models — so **inference token cost is unchanged** by adopting `eve`. The cost/latency risks are
structural, not per-token:

- **Durability on the hot path.** Vercel Workflows persisting/resuming session state adds state I/O
  to request latency. The current chat turn is a single bounded `streamText({ stopWhen:
  stepCountIs(limit) })` with no durable checkpoint — fast by design. Don't regress that.
- **Multi-step / subagent fan-out.** `eve` supports subagents (recent commits reference subagent
  child prompts). Skills that over-decompose multiply token spend and round-trips. Bound step/subagent
  counts as we already bound `toolStepLimit`.

Back-of-envelope: keep the synchronous artist chat on the existing `streamText` glue (zero added
cost/latency), and use `eve` only where a **durable, resumable, multi-channel** agent is actually
warranted (e.g. the studio-session memory loop). The expensive part is always the model tokens; `eve`
neither raises nor lowers those.

---

## Migration sketch (from the current `lib/ai/sdk.ts` glue)

Today's glue (verified):

- `apps/web/lib/ai/sdk.ts` (144 LOC) — thin wrapper over the `ai` package, composed with Braintrust
  (`wrapAISDK`) + an output leak-guard; re-exports `generateText` / `streamText` / `generateObject` /
  `streamObject` and a `gateway` selector (AI Gateway, optionally via Helicone).
- `apps/web/lib/chat/run.ts` (462 LOC) — `executeChatTurn`: builds the system prompt, converts
  messages, selects model, and calls AI SDK's **native** multi-step tool loop (`streamText` +
  `stepCountIs` + `prepareStep` + `ToolSet`). The "bespoke harness" is mostly the SDK's own agent
  loop plus our leak-guard/telemetry.
- `apps/web/lib/agents/agent-harness.ts` (303 LOC) — the `AgentHarness` interface + `OpenAIAgentsAdapter`
  stub (the #9871 swap boundary).

Phased path (matches #12498's "flag-gated web integration → port one skill → measure → roll out").
Note the **sequencing**: because the only real risk is `eve`'s pre-1.0 churn (Q4), the first contact
must be the *lowest*-surface-area thing that exercises the adapter, **not** the durable memory loop.

1. **De-risk the `ai` v6 → v7 bump as its own task, landed first and alone.** This is a one-major jump
   across the most load-bearing dependency in the chat path; the leak-guard wraps `streamText` /
   `streamObject` result shapes that change across AI SDK majors. Treat the leak-guard wrap as the
   named regression surface and **add a regression test proving the guard still fires on v7** before
   any `eve` work (repo "Shame-on-Me" clause). Keep Gateway + leak-guard + Braintrust wrapping intact —
   the guard is a trust boundary on every model-output path, not optional glue.
2. **First `eve` contact = a thin, non-critical, non-durable skill** (a throwaway "shake-out" agent
   project) to validate the adapter, the `agent/` convention, and the deploy unit — *before* betting
   any paying feature on it. **Pin `eve` to an exact version and deliberately freeze it**, batching
   upgrades rather than chasing the daily releases, until `eve` reaches ~1.0.
3. **Then** stand up the durable feature: the studio-session memory loop is the natural target — it
   already has an `AgentHarness` and lives behind the `MEMORY_STUDIO_SESSION_V0` flag. Author its skill
   as portable `agent/skills/*.md` + `agent/tools/*.ts`; tools call the existing `MemoryStore`
   (Neon/Drizzle) exactly as `OpenAIAgentsAdapter` does — Memory Core unchanged.
4. **Wire `eve` in as `EveAgentAdapter implements AgentHarness`**, selected by flag; the existing
   `OpenAIAgentsAdapter` stays as the fallback/rollback.
5. **Leave the synchronous artist chat (`run.ts`) on `streamText`** for now — migrate it to an `eve`
   channel only after the durable path proves out, to avoid regressing chat latency (Q5).
6. **Measure** cost/latency vs. baseline before removing any existing glue.

What does **not** move: `lib/ai/sdk.ts`'s leak-guard/Gateway wrapping (keep it — or re-apply it as an
`eve` hook), Trigger.dev product workflows (#9871), and the internal AgentOS control plane (#8191).

---

## ADR reconciliation (must not silently re-decide)

**ADR [#8191](https://github.com/JovieInc/Jovie/issues/8191) — Vercel Workflow/WDK = internal AgentOS
control plane.** No conflict. `eve` is the **product** agent layer (artist-facing); it does not touch
the merge/deploy gate authority (GitHub Actions + GStack), the `AgentRunArtifact` contract, or
Ruflo/Hermes adapters. #8191 stands as written.

**ADR [#9871](https://github.com/JovieInc/Jovie/issues/9871) — product memory split.** This is where
`eve` must be reconciled, not re-litigated. #9871 set three boxes: **Trigger.dev** owns durable
customer-facing product workflows; the **Agent SDK behind `AgentHarness`** owns
extraction/planning/reasoning/tool orchestration (it named OpenAI Agents SDK as the *then*-target,
explicitly behind a swappable interface); **Memory Core (Neon/Drizzle)** owns canonical facts.

- `eve` replaces the **`AgentHarness` box only** — i.e. it is the concrete harness in place of the
  `OpenAIAgentsAdapter` stub. This is consistent with #9871's interface-first design, which left the
  harness deliberately swappable. The founder pivot from "OpenAI Agents SDK" to "`eve`" is a change of
  *implementation behind the same interface*, not a change of architecture.
- **Conflict to avoid:** `eve` is "durable by default" **via Vercel Workflows**. #9871 deliberately
  moved durable customer-facing workflows **off** Vercel Workflow/WDK and **onto Trigger.dev**.
  Adopting `eve`'s durability wholesale would silently reverse that. **Resolution:** use `eve` for
  reasoning/tool-orchestration; keep **Trigger.dev** as the durable product-workflow runner; do not
  route customer-facing durable jobs through `eve`'s Vercel-Workflows durability.

**ADR delta to record (in the build epic, not this spike):** update `docs/MEMORY_CORE_ARCHITECTURE.md`
and `docs/MEMORY_ADR.md` decision tables to name `eve` (not OpenAI Agents SDK) as the target
`AgentHarness` implementation, while affirming the Trigger.dev product-workflow boundary is unchanged.
Tracked by parent epic #12498's acceptance ("Decision + ADR delta recorded").

---

## Security scoping (for the build epic, not this spike)

Adopting `eve` introduces a new deploy unit and new Vercel primitives; the build epic must scope these
before they touch the paying path:

- **Vercel Sandbox** (isolated code exec) — define exactly *what* runs in it and with what privileges.
  If model-generated or skill-supplied code executes, that is an RCE-shaped surface and needs an
  explicit allowlist/threat model.
- **Vercel Connect** (OAuth/API-key vault) — moving the product agent to its own Vercel project may
  shift credential custody out of Doppler / the web app's existing secret path. Decide the
  secret-custody boundary for the new unit explicitly.
- **New deploy unit ≠ `apps/web` middleware.** `eve` channels (HTTP/Slack/Discord/GitHub) are inbound
  surfaces on a separate service that will **not** inherit `proxy.ts`'s CSP / auth / nonce protections.
  Re-establish CSP, egress/SSRF controls, and auth on the channel layer.
- **Supply chain at pin time** — given the daily churn, re-verify `eve`'s Apache-2.0 license and its
  transitive-dep licenses when pinning the exact version.

These are scoping notes; none change the conditional-GO verdict.

## Method note / corrections

- **No code was installed or changed.** This is a writeup-only spike, and per the repo's external-skill
  governance the `eve` *framework* (`vercel/eve`) is not a vetted SKILL package — adopting it is a
  product-architecture decision, not a `skills add`. Evidence came from the public repo
  (`gh api repos/vercel/eve`), Vercel's announcement/docs, and our own in-repo code.
- The parent issue's install hint `npx skills add vercel/eve` conflates two tools: `npx skills add`
  installs **Agent Skills (`SKILL.md`) packages** *into* an agent; **scaffolding an `eve` agent** uses
  `eve`'s own CLI to create the `agent/` project. The build epic should scaffold with the `eve` CLI and
  use `skills add` (from `vercel-labs/agent-skills`) only to pull in portable skills.
- The issue references `apps/web/lib/chat/ai/sdk.ts`; the real chokepoint is `apps/web/lib/ai/sdk.ts`
  (consistent with #10770 / #12221).
