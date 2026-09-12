# Research receipt — 2026-09-05

Scope: prompting, context management, instruction files, skills, harnesses and evals
for modern coding models. First-party provider documentation drove the changes;
[provider evidence](providers.md) records the model-specific differences and links.
No claim of universal optimality follows from this research.

The requested `last30days` skill ran its search engine with a structured query plan,
Reddit community queries and TikTok hashtags. X access was unavailable. The engine
selected evergreen coverage for the how-to topic and mixed older items into its
nominal recent window; these are not all publications from the last 30 days.
Separate native web searches supplied official documentation. Counts below are
engine retrieval counts, not quality weights or evidence of independent agreement.

What I learned:

**Keep the entry file a routing map.** OpenAI's harness guidance supports a compact
entry point and discoverable deeper knowledge. Community enthusiasm for Markdown
workflows also comes with maintenance frustration: @mistermanko wrote, “Wanted to
become a programmer, became a markdown-file-manager. Thanks AI.” (1,200 likes on
[this April 24 video](https://www.youtube.com/watch?v=-QFHIoCo-Ko), outside the recent
window). This supports investigating duplication; it does not prove a token target.

**Scope rules with actual host features.** Claude documents native path matching,
while other hosts have different loaders. The September 2 first-party session
[How the Claude Code team uses Claude Code](https://www.youtube.com/watch?v=S-sYlFiGFv8)
was a recent practical discovery; API and loader claims were checked in official
docs. All 19 local Claude rule files previously lacked native path frontmatter.

**Test preserved decisions as well as smaller files.** Retrieved discussions are
useful hypotheses. Provider eval guidance supports executable outcomes, negative
cases and repeated trials. We therefore preserve every original design section,
test authority and authorization choices, and distinguish scenario decisions from
actual tool execution and native compaction.

**Keep provider state in the provider adapter.** Current model families differ in
reasoning controls and history requirements. Repository prose must not prescribe
a universal message-pruning trick. Exact served model and account access must be
recorded separately from published availability.

Reproduction artifacts remain local under `/tmp/jovie-context-research/`: plan,
engine output, raw Markdown with web supplement, initial failed schema trial,
frozen v2 inputs, raw live responses, timing, usage and input hashes. Temporary
paths are not durable storage; the checked-in eval receipt records aggregate proof.

The following is the engine's required verbatim footer (its “agents” describes its
own retrieval output, not Codex subagent delegation):

---
✅ All agents reported back!
├─ 🟠 Reddit: 21 threads │ 6,123 upvotes │ 2,209 comments
├─ 🔴 YouTube: 11 videos │ 5,093,899 views │ 6/11 with transcripts
├─ 🎵 TikTok: 19 videos │ 113,466 views │ 3,622 likes
├─ 📸 Instagram: 12 reels │ 4,501 likes
├─ 🟡 HN: 26 storys │ 1,364 points │ 622 comments
├─ 🐙 GitHub: 14 items │ 33 reactions │ 266 comments
├─ ⛏️ Digg: 21 clusters │ 213 posts │ 90 authors
├─ 📰 Techmeme: 4 headlines
├─ 🌐 Web: 11 pages - vibecoding.app, dev.to, d-central.tech, infoq.com, symvanta.com, opennash.com, promptfoo.dev, circleci.com
├─ 🗣️ Top voices: r/ChatGPTCoding, r/ClaudeCode, r/LocalLLaMA
└─ 📎 Raw results saved to /private/tmp/jovie-context-research/engine.txt
---
