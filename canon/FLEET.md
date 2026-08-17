# Jovie Fleet Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-08-17
Source: founder interview, 2026-08-17

The fleet exists to make Jovie default alive. It does not exist to file issues, keep agents busy, or maximize merges.

Default alive means **MRR covers all-in burn** (infra + AI/fleet + subscriptions + founder draw).

---

## Scoreboard (2026-08-17)

| Input | Value | Source |
|---|---|---|
| Company cash | **$0** (both Mercury accounts) | Tim 2026-08-17. Matches `ops/alive-morning-card-2026-08-13`. |
| MRR | **$0** | Tim: not sellable. Staging Stripe: 0 active, 0 trials. |
| Known paid tool floor | **$935 / mo** | 3× Codex $200 + Kimi $200 + Grok Superheavy $99 + Gmail ~$16 + Linear Basic ~$10 + OpenCode Go $10. Gateway is usage. Claude is dead. Paid from founder survival. |
| Company runway | **0 weeks** | No company cash. |
| Default alive | **no** | MRR $0 and cash $0. |
| Company default-alive date | **not on the calendar** | Requires company cash > 0 and MRR ≥ all-in burn. |
| Founder-funded survival | **private receipt** | Loan, not equity, not company cash. Clock and burn live in ops `finances/default-alive.md`. |

The 2026-08-13 Alive lock stays **fundraise** until company cash > 0, a paid-customer receipt, or a real launch receipt. Web still has to become sellable. **No new paid spend.** HyperAgent and Cloudflare credits were **given, not bought** — use them, do not buy more. Vercel AI Gateway is for cheap DeepSeek etc. Clerk and Claude are gone. The $25k SAFE is spent — not cash. Shipping velocity is not a survival number.

---

## Current bottleneck

A real artist cannot get first value and pay on the **web golden path**.

The delivery enabler in front of that: ready work does not land overnight without Tim. Gem may work the factory only while that is true. Factory SLO (ready PRs land, no Tim) is Gem's scoreboard. It is not the company's.

---

## Org

Organize by **constraint packets**, not skill titles and not standing surface teams. Skills are shared files.

| Role | Job | May page Tim |
|---|---|---|
| Tim | Morning briefing in. 10–60 min video out. Taste, pricing, outbound, irreversible calls. | — |
| Summer | Company governor. One bottleneck. Admit / park / escalate. On demand. | Decision cards only |
| Gem ↔ Symphony | Engineering factory. Drain admitted work. Repair each other. | Only if the factory is down |
| Web walker | Only standing taste/QA role. Dogfoods web signup → first value → pay. | Never. Files to Summer |

Everyone else is burst or personal:

- **Zoe** — personal only. Hard wall. Never Linear.
- **HyperAgent** — spend remaining credits on packets Summer admits. No always-on schedules. No second CoS.
- **Eve / Aria / specialists** — keep if cheap. No heartbeat. Revive only when Summer names the packet they uniquely own.
- **iOS / Mac / content walkers** — burst after a web ship lands there, or after web is sellable.
- **Grok bot** — a channel, not the runtime. Fail over when Grok quota dies. Do not move souls into Grok-only.
- **Ovie** — the ops screen. Telegram/Grok show the same state.

Summer owns the company bottleneck. Gem owns the engineering bottleneck. If Symphony is down, Gem fixes it. If Gem is down, Symphony fixes it. Tim is not Gem.

---

## Admission, not filing

Tim may dump every day. **Admission is not filing.**

WIP: **1 sellability packet** + **1 factory packet only if overnight ships are down**.

| Video bucket | Action |
|---|---|
| Hits web sellability or factory-down | Admit. Complete packet: owner, verification, rollback |
| Useful later | Park. Invisible to Gem |
| Research | `/last30days` + X, then park or admit |
| Content | Sanitized → Jovie creator library |
| Personal | Zoe |
| Already in the old teardown pile | Dedup. Not a new issue |

The ~1000 teardown issues are a liability. Gem pulls only from Summer's admitted set. Exhaustive backlog classification already deferred most of them (Aug 9 RCA: 42 eligible, 904 deferred). Eligible is not admitted.

Work admission and production promotion stay separate typed authorities (GREEN / AMBER / RED). Nothing authenticates as Tim to strip `queue-deferred` or jump the merge queue.

---

## Founder day

**Morning — one briefing on Ovie.** Cash / burn / runway / MRR. Did overnight ships land. Web path pass/fail and the death step. The one admitted packet. At most three decision cards, each with a default-if-silent.

**Then a 10–60 minute video.** Teardown, ideas, objectives. Summer classifies. Sensitive stays blocked.

Tim does not open Linear in the morning. Tim does not enroll PRs.

---

## Anti-goals

- Grow coder concurrency to eat the 1000-issue pile
- Stand up four always-on product walkers
- Migrate the fleet into Grok-only
- Optimize PRs/hour while MRR is $0
- Let Summer stay in shadow while Tim keeps the machine moving

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-08-17 | Created. Constraint-packet fleet. Web-first sellability. Admission ≠ filing. Scoreboard: both accounts $0, $0 MRR; $935/mo known tool floor; gifted credits; $25k SAFE spent. | Tim White |
