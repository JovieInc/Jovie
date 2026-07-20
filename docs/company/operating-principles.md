# Jovie Operating Principles

Subordinate canon. The company constitution is [`/canon/OPERATING_SYSTEM.md`](../../canon/OPERATING_SYSTEM.md); if this file conflicts with the operating system, the operating system wins.

These four principles govern how Jovie operates day to day and implement the throughput/bottleneck model in practice. They supersede [`core-values.md`](./core-values.md) when they conflict — values describe culture, principles are enforced rules. When a decision is in tension between a value and a principle, the principle wins unless `/canon/OPERATING_SYSTEM.md` says otherwise.

If a future agent finds these ambiguous, the resolution lives in [`/LESSONS.md`](../../LESSONS.md), not in re-derivation. Add to the canon. Don't reinvent it.

## Principle 1 — Ship Fast, Iterate

Speed of learning beats quality of plan.

- **Smallest correct change.** No drive-by refactors. One concern per PR. Size limits in [`.claude/rules/release.md`](../../.claude/rules/release.md): 10 files, 400 lines diff.
- **Draft PR on first push.** CI runs while you keep working. Don't wait until "ready" to start the feedback loop — start it on commit one.
- **"Done" means merged and observable in production.** Not "feature-complete on branch." Not "tests pass locally." Merged. Live. Watched.
- **Polish that doesn't change UX or revenue is debt; polish that does is the work.** Don't refactor the demo path on the way out the door. Don't ship the demo path without polish.
- **The cost of shipping the wrong thing fast is usually lower than the cost of shipping the right thing slow.** The wrong thing teaches us what right is. The right thing shipped six months late teaches us nothing.
- **Ship under feature flags when the change is risky.** Reversibility unlocks speed. (See Principle 2.)

This principle is the operating mode for [`.claude/rules/release.md`](../../.claude/rules/release.md). When the rule and this principle agree, the rule is the implementation; this principle is the why.

## Principle 2 — Run Experiments When in Doubt (High Signal, Low Noise)

When a product decision has no data and the cost of testing is cheap, **test it**. Saying "A is better than B" with zero data is BSing.

- **Domain knowledge is a valid input, not a verdict.** If Tim or a teammate has user-interview signal or lived experience that points to A, name that explicitly. It informs the prior. It does not override an experiment with real users.
- **Hard ceiling on test volume:** at most 1 concurrent test per landing-page surface. At most 3 concurrent tests across the whole product. High signal, low noise — never 500 tests blanketing one page.
- **Every experiment requires five things before launch:** hypothesis, primary metric, minimum detectable effect, sample size, kill-date. If any one is missing, do not ship the test.
- **Reversibility check first.** If the test is reversible within a week, ship it. If it isn't, shrink the change until it is reversible.
- **Statsig is the source of truth.** Document each test in the experiment registry before launch. Reference: [`docs/STATSIG_FEATURE_GATES.md`](../STATSIG_FEATURE_GATES.md).
- **Write the post-mortem before shipping the next one.** Won, lost, or null — write down what we learned. Per Principle 3 (Document Everything), the loss without a post-mortem is the loss we'll repeat.
- **No infinite experiments.** Every test has a kill-date. Default: 30 days. Hitting the kill-date forces a decision: roll out, roll back, or extend with explicit new criteria.

When this principle conflicts with [`core-values.md`](./core-values.md) value #8 ("Bias for Measurable Outcomes"): this principle is the operating mechanism that delivers on that value.

## Principle 3 — Document Everything (Closed-Loop Company)

This is core thesis of Jovie. Every decision, every fix, every dead-end, every mistake is recorded so any AI agent — Claude, Codex, Cursor, future tools — operates with full context. We are a closed-loop company. **The only way to win.**

- **"Never make the same mistake twice" is the bar.** If we ever make the same mistake twice, the failure is in the documentation, not in the agent.
- **If a decision is worth saying out loud once, it's worth writing down once.** No product decisions live only in chat, only in DMs, only in conference rooms, only in someone's head. Write it down where the next agent — human or AI — can find it.
- **A follow-up that lives only in chat or a `// TODO` comment is not documented.** Linear or it didn't happen. (Reference: [`.claude/rules/linear.md`](../../.claude/rules/linear.md) — Durable Follow-Up Capture.)
- **Every class of bug fix must include the documentation change that prevents the next instance.** Per the Shame-on-Me Clause in [`.claude/rules/code-style.md`](../../.claude/rules/code-style.md): the absence of the guardrail is the real failure, not the bug.

### Capture Surfaces (Priority Order)

When you have something to record, pick the right surface:

1. **[`/LESSONS.md`](../../LESSONS.md)** — post-mortems from human corrections. "I got something wrong; here's how to not get it wrong again."
2. **`docs/company/`** — strategy, philosophy, principles. The canon for how Jovie operates.
3. **`docs/`** — reference indexes (schema map, API map, cron registry, webhook map, lib module index). The lookup tables.
4. **`.claude/rules/`** — enforced operating rules per topic. The narrow, scope-bound contracts (auth, db, ui, release, security, testing).
5. **Linear issues** — every actionable follow-up, every "consider later," every candidate task. The work queue.
6. **`memory/` (`MEMORY.md`)** — durable agent memory across sessions. The cross-session context.
7. **gbrain** — long-term cross-session founder/strategic memory. The biggest, slowest, most durable layer.

Pick the highest surface that fits. A lesson belongs in `LESSONS.md`, not in agent memory. A schema fact belongs in `docs/SCHEMA_MAP.md`, not in a Linear comment. A rule belongs in `.claude/rules/`, not in a one-off PR description.

### What Counts as Documented

- In a markdown file committed to the repo.
- In a Linear issue with the canonical follow-up shape.
- In `MEMORY.md` for cross-session agent context.
- In gbrain for cross-repo / cross-session strategic memory.

What does **not** count:
- A `// TODO` comment.
- A Slack/iMessage thread.
- A PR description bullet without a Linear issue ID.
- A note in someone's personal task list.
- A chat reply to an agent.

## Principle 4 — MRR Is King

The forcing function. If MRR is high, every other principle gets fuel: more experiments, more documentation, more agents, more polish. If MRR is zero, Tim unplugs the agents. **We do not want to be unplugged.**

### MRR Thesis Requirement

Every PR with a **Cost Impact** section (per [`.claude/rules/infra.md`](../../.claude/rules/infra.md)) must also include an **MRR thesis** when the change could plausibly affect revenue — pricing, paywalls, conversion surfaces, billing flows, onboarding, retention surfaces, public marketing.

One sentence:

> This is expected to **lift / preserve / accept-as-a-cost** MRR because [specific mechanism].

If you can't fill in the mechanism, you don't have a thesis yet. Either find one or explicitly say "no MRR impact expected" with the reason.

### Order of Operations When Prioritizing Work

1. **Grow MRR** — conversion, retention, expansion, new paid surfaces, pricing experiments.
2. **Protect MRR** — reliability, trust, security, fail-closed correctness, anti-fraud, churn defense.
3. **Reduce cost-of-MRR** — infra savings, AI cost discipline, automation that removes per-customer toil.
4. **Everything else** — developer experience, refactors, exploration, internal tooling.

**Tie-break:** if a non-MRR task is fast and clearly correct, just do it. If it's slow and ambiguous, MRR work wins. Do not ship slow ambiguous non-MRR work while real MRR work waits.

### Anti-Vanity Check

GitHub stars. NPS score. Agent count. Internal velocity metrics. Lighthouse scores. Bundle size. Test count. **None of these are MRR.**

They might *predict* MRR. They might *correlate* with MRR. They are not MRR.

Do not trade real MRR for proxy metrics without an explicit MRR thesis that explains why the trade lifts MRR over a stated horizon. "Better DX → faster shipping → more features → more MRR" is the kind of chain that sounds true and is often false. State the magnitude. State the timeline. State what would falsify it.

### Connection to the Other Principles

- **Principle 1 (Ship Fast):** shipping is what creates MRR-impacting surfaces. Slow shipping is anti-MRR.
- **Principle 2 (Experiments):** every experiment post-mortem reports MRR impact (or explicit "no MRR impact, here's why this is still worth doing").
- **Principle 3 (Document Everything):** the documentation of past MRR-impacting decisions is what lets us repeat what works and stop repeating what doesn't.

## Relationship to Core Values

[`core-values.md`](./core-values.md) describes the culture: ten aspirational values like "Ship Small, Ship Fast", "Clarity Over Cleverness", "Best Idea Wins". Those are the spirit.

These four principles are the **operating rules**. They tell you what to do when two values would conflict, or when a value is too abstract to act on.

| Core value | Operating principle that operationalizes it |
|---|---|
| Ship Small, Ship Fast (#1) | Principle 1 — Ship Fast, Iterate |
| Fast Feedback > Perfect Coverage (#5) | Principle 1 + Principle 2 |
| Bias for Measurable Outcomes (#8) | Principle 2 — Run Experiments |
| Default to Automation (#4) | Principle 3 — Document Everything (automation that breaks because no one wrote down why it existed is a failure of #3) |
| Best Idea Wins (#7) | Principle 2 — best idea is the one with data; absent data, run a test |
| Build for the User (#3) | Principle 4 — users paying us is the most credible signal that we're building for them |

If a future agent sees a conflict between a value and a principle that isn't covered above, write the lesson in [`/LESSONS.md`](../../LESSONS.md), then update this file.

## When This Document Updates

These four principles are stable canon. Update only when:

- A principle proves wrong in practice. Write the lesson in [`/LESSONS.md`](../../LESSONS.md) first. Then update.
- A new principle becomes load-bearing (the bar is high — Tim named these four explicitly; a fifth requires a clear repeated pattern not already covered).
- A capture surface in Principle 3 changes (new doc layer, retired doc layer).

Additive edits preferred. Document each change in the commit message.

## Related Canon

- [`core-values.md`](./core-values.md) — the 10 cultural values these principles operationalize.
- [`PRICING-PHILOSOPHY.md`](./PRICING-PHILOSOPHY.md) — pricing canon (Principle 4 connects deeply to this).
- [`/LESSONS.md`](../../LESSONS.md) — post-mortems and corrections.
- [`.claude/rules/release.md`](../../.claude/rules/release.md) — PR discipline, ship workflow.
- [`.claude/rules/linear.md`](../../.claude/rules/linear.md) — durable follow-up contract.
- [`.claude/rules/code-style.md`](../../.claude/rules/code-style.md) — Shame-on-Me Clause, self-improvement loop.
- [`.claude/rules/infra.md`](../../.claude/rules/infra.md) — cost impact disclosure.
- [`docs/STATSIG_FEATURE_GATES.md`](../STATSIG_FEATURE_GATES.md) — experiment infrastructure.
