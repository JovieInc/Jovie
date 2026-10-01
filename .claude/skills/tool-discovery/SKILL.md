---
name: tool-discovery
description: |
  Evaluate a tool/product Tim shares (a link, a screenshot, or just a name) without
  asking him to do the legwork. Use whenever a message shares a tool/repo/product
  and expects an opinion or evaluation — "check this out", "is this worth using",
  "what does this do", a bare link with no context. Extracts search terms, finds
  the GitHub repo and docs/pricing/reviews via gh search + WebSearch/WebFetch, and
  returns a structured evaluation instead of asking Tim to fetch info first.
  Also provides the capability-first mode for JOV-6212: before implementing or
  materially expanding a commodity capability, run the same bounded research pass
  and record the sourcing decision receipt instead of jumping straight to a build.
---

# Tool Discovery

Turn "Tim sends a link → agent asks Tim to research it" into "Tim sends a link →
agent returns an evaluation." Never ask Tim to click, comment, log in, or fetch
anything to unlock a link — search around the gap instead.

## When to use

- A message shares a link (social post, product site, tweet, repo) with little
  or no context and expects an opinion.
- A message names a tool/product ("have you seen X") and wants to know what it
  is, what it costs, and whether it's worth adopting.
- Any time the honest next step would be "let me ask Tim for more details" —
  try search first, only ask if search genuinely comes up empty.

## Capability-first mode (JOV-6212)

Before an agent implements or materially expands a **commodity capability**
(auth handoff, PDF rendering, scheduling, parsing, visual diffing, state
management, any known software category), run the same research pass from the
other direction — not "what is this tool?" but "should Jovie reuse, configure,
adopt, buy, extend, fork, or build this?" The single authority is the
**Capability-Level Sourcing Policy** in
[`canon/ENGINEERING.md`](../../../canon/ENGINEERING.md#capability-level-sourcing-policy)
(invariant JOV-INV-041); `.claude/rules/code-style.md` "Build Before You Build"
routes to it. This skill is the reactive research arm — it never replaces that
policy, adds a second skill tree, or gates shipping.

1. **Classify the capability** — differentiating product logic, necessary
   integration, or commodity mechanism — and name the canonical
   implementation/owner if one exists in the repo.
2. **Check the existing decision first**: search gbrain and the repo for an
   applicable current sourcing decision; reuse it without repeating research
   (renew only when requirements, versions, workload, or security posture
   changed).
3. **Run Steps 1–3 above** (repo/docs search) against the incumbent
   implementation, the platform/standard library, official vendor integration
   indexes, and credible maintained OSS — recording exact versions and checked
   dates. Official integration indexes (e.g. a vendor's documented Electron
   integration) must be checked before recommending a bespoke mechanism.
4. **Return the sourcing receipt**, not just an evaluation: outcome ·
   capability and scope · canonical owner · hard requirements · alternatives
   with evidence/version/date · disposition (reuse/configure/adopt/buy/
   extend/fork/build) + why · custom delta and rejected alternatives for
   custom/fork · lifetime cost/risk · tests · rollback triggers · policy and
   source binding · independent review when an exception is requested.
5. **Feed the receipt through the existing task packets** for the worker that
   ships the change — do not assume this skill is callable by every runtime.
   Missing evidence produces a bounded executable research task, never a
   rewrite and never a dead end ("we couldn't browse, therefore no SDK exists"
   is not a verdict).

Unverified facts stay unverified in the receipt. The implementation author
cannot self-approve an exception over the policy, a checker, or an allowlist —
that requires the existing independent review path.

## Workflow

### Step 1 — Extract search terms

Pull whatever identifying text exists: tool/product name, caption, alt text,
URL slug, surrounding message text. Do **not** ask Tim to perform an action
(comment on a post, sign in, DM someone) to unlock a link — if the source is
gated or unfetchable, work from the text already available and say so in the
evaluation instead of stalling on it. Only ask Tim for more input if extraction
finds genuinely zero identifying text (no name, no caption, no slug) — that's
a missing-input question, not a "please unlock this for me" ask.

Try fetching the link itself first for extra context (title, caption, OG
metadata) — treat a fetch failure or login-gated response as expected, not a
blocker:

```
WebFetch(url, "Extract the product/tool name, one-line description, and any linked URLs")
```

### Step 2 — Find the GitHub repo

```bash
gh search repos "<tool name>" --limit 5 --json fullName,description,url,stargazersCount,updatedAt,license
```

If nothing relevant comes back, fall back to `WebSearch("<tool name> github")`.
No match after both — note "no public repo found" in the evaluation; don't guess.

### Step 3 — Find docs, pricing, reviews

Run a `WebSearch` for the official site/docs and a separate one for reception
(Hacker News, Reddit, reviews) — e.g. `<tool name> pricing docs`, then
`<tool name> review OR "hacker news"`. `WebFetch` the official site/pricing
page if the search doesn't already surface the numbers.

### Step 4 — Return a structured evaluation

```markdown
## <Tool Name>

**One-line:** <what it does, in one sentence>
**Repo:** <github url or "no public repo found"> — ⭐<stars>, <license>, last commit <date>
**Pricing:** <free / $X/mo / usage-based / not found>
**Docs:** <link or "not found">
**Key features:** <3-5 bullets, only what you actually verified>
**Reception:** <one line — what reviews/discussion say, or "no discussion found">
**Fit for Jovie:** <one line — relevant only if there's an obvious tie-in; otherwise omit>
```

Mark anything unverified as "not found" rather than filling it in with a guess.

### Step 5 — Save it

Save the evaluation to gbrain so it survives the session and other agents can
find it before re-researching the same tool:

```
mcp__gbrain__put_page({ slug: "tool-evaluations/<tool-slug>", content: "<the evaluation from Step 4>" })
```

Skip silently if gbrain is unreachable — this is a nice-to-have persistence
step, not a blocker (same "gracefully degrade" rule as the coordination
preflight in `AGENTS.md`).

## What this skill does NOT do

- Does not ask Tim for credentials, logins, or manual unlock actions (posting
  a comment, DMing an account) to access a gated link.
- Does not fabricate specs, pricing, or star counts it couldn't verify.
- Does not install or run the tool — this is a research/evaluation pass, not
  an integration. If Tim wants it adopted, that's a separate follow-up with
  its own prior-art gate (`.claude/rules/code-style.md` → "Build Before You
  Build").

## Common failures

| Symptom | Fix |
|---------|-----|
| Link is login/comment-gated (e.g. Instagram "comment AI for the link") | Work from caption/message text only; note the gap in the evaluation instead of asking Tim to unlock it |
| `gh search repos` returns nothing relevant | Fall back to `WebSearch("<name> github")`; if still nothing, say "no public repo found" |
| Official site has no visible pricing | Note "pricing not found" rather than guessing a tier |
| gbrain unreachable for Step 5 | Skip the save, still return the evaluation inline |
