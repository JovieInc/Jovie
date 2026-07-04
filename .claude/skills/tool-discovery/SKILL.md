---
name: tool-discovery
description: |
  Evaluate a tool/product Tim shares (a link, a screenshot, or just a name) without
  asking him to do the legwork. Use whenever a message shares a tool/repo/product
  and expects an opinion or evaluation — "check this out", "is this worth using",
  "what does this do", a bare link with no context. Extracts search terms, finds
  the GitHub repo and docs/pricing/reviews via gh search + WebSearch/WebFetch, and
  returns a structured evaluation instead of asking Tim to fetch info first.
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
