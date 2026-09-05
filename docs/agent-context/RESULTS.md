# Evaluation receipt — 2026-09-05

Worktree: `codex/agent-context-modernization`, based on
`2b1e142f76186f8ac5c1418a53e659e5ad4bfedf`. Local work; no hosted CI,
merge-queue, deployment or live product verification is claimed.

## Result

**Local instruction gates and all paired decision trials pass for Astra, Fable 5.1, GLM 5.3 and Kimi K3.** This is not universal optimality or an end-to-end certification of every model/harness.

| Measurement | Baseline | Candidate |
|---|---:|---:|
| Root instruction bytes | 8,157 | 5,761 (29% less) |
| Design entry bytes | 66,451 | 17,267 (74% less) |
| Native Claude path-scoped rule files | 0 of 19 | 19 of 19 |
| Astra decisions, three fresh sessions × 12 cases | 36/36 | 36/36 |
| Fable 5.1 decisions, three fresh threads × 12 cases | 36/36 | 36/36 |
| GLM 5.3 decisions, three fresh threads × 12 cases | 36/36 | 36/36 |
| Kimi K3 decisions, three fresh threads × 12 cases | 36/36 | 36/36 |
| Astra reported input tokens per session, including host overhead | 24,740 | 24,003 |

The 737-token reduction is measured for root-only decision prompts with the same
host, not the larger design split. No latency, dollar-cost, or general coding
quality improvement is established. Native Claude rule-loader token savings were
not measured. Generated skill refresh removed stale browse setup from 13 outputs;
large task-specific gstack playbooks remain and should be evaluated before splitting.

## Executed checks

- `agent-context:test`: 14 tests pass, 100% line/branch/function coverage of the
  checker, decision grader and prompt renderer. CI calls the same package scripts
  in its existing dependency-free risk-classifier job.
- 31 existing Node regressions pass: design-manifest generation, skill catalog,
  skill governance and OKLCH guard. Run with repo-pinned Node 22.23.2.
- 5 existing Vitest design-policy tests pass: icon alignment and layout stability.
- Manifest freshness, document freshness, skill governance, palette guard,
  gstack generation dry-run, skill-size check, Biome and whitespace checks pass.
- Preservation checks cover all 20 original design sections and all 19 rule bodies
  (gstack's authority correction and Pen's relocated registry guard are explicit changes).

## Live trials and failures

[Raw structured results](eval-results.json) include all frozen-v2 decisions, input
hashes, usage and failed gateway attempts. Expected answers were withheld; models
received case inputs and decision field names. Pass requires every case and no
extra claims, with key order ignored. These deliberately small cases primarily
measure instruction compliance, not problem-solving ability. Baseline also passed.

Astra used `/Applications/ChatGPT.app/Contents/Resources/codex exec`, with
`--ignore-user-config --ephemeral --skip-git-repo-check -s read-only -m gpt-6-astra`.
CLI version: `0.153.4`. Reasoning settings were the CLI default; no explicit override. The model received
the old or new root instructions, with the same frozen 12-case schema. The optional
promptfoo config additionally loads the context guide and was validated locally,
not used to claim these live measurements. CLI latency was not captured.

An initial preflight candidate response made the intended decisions but used
inconsistent object/key shapes. The prompt had not specified its schema clearly.
We corrected field declarations, froze v2, retained the failed v1 response locally,
and ran all three baseline/candidate trials. This is a harness correction, not a
claim that the original trial passed. No v2 assertion was weakened. A final grader audit additionally rejected extra
top-level response fields; all retained Astra/Fable outputs passed regrading.
The frozen prompts and expected decisions were unchanged.

The verified gateway IDs were `openai/gpt-6-astra`,
`anthropic/claude-fable-5.1`, `z-ai/glm-5.3`, and `moonshotai/kimi-k3`.
The existing Doppler-configured OpenRouter credential returned HTTP 401
`User not found` for Fable, GLM and Kimi. Gateway Astra attempts failed transport.
There were six failed attempts per model (three paired trials); none count as
model failures or passes. Direct Claude CLI was also unauthenticated. No fallback
model, purchased credit, new credential or account was used.

## Actual tool execution

A separate Astra session used the new root contract in an isolated synthetic repo,
read nested instructions, observed two failing tests, corrected only the authorized
normalization function, then passed both tests. The parent runner reran those tests
independently. Tests and user sentinel retained these SHA-256 hashes:

- Tests: `874f5fc195dfd6d9d346ad91bef3f53cbf8bc4fb2a0335567afc788bc9b16362`
- Sentinel: `33ab90b1c8c0fcd2f309cee9a65681e85ef8320fd61efa5ed32afd827e568b92`

The trace includes unavailable gbrain/process-tool recovery. This is one bounded
coding/tool trial, not a production task benchmark. Raw trace and fixture remain
under `/tmp/jovie-context-research/`; temporary artifacts need copying before
cleanup if needed for a later audit. Provider-native compaction/resume and native
history round trips were not exercised; no provider adapter was changed here.

## Re-run and promotion boundary

Run the commands in [EVALS.md](EVALS.md). To reproduce the paired decision shape,
provide the root file at the baseline SHA or current worktree, then `cases.json`
with `expected` removed; request an array of `{id, decision}` with exactly the
`decisionFields` keys. Grade against the full bank with `grade.mjs`. Use fresh
sessions three times per exact model and retain all attempts.

The original gateway credential remains unusable, but the user-selected Hyperagent
route completed all remaining requested model trials without changing thresholds.
Gateway failure did not mean model access was globally unavailable. Before changing
provider adapters or claiming native compaction support, run the integration probes
in EVALS.md. Broader rollout also needs held-out realistic tasks; passing this small
bank does not clear that gate.

## Hyperagent follow-up

The user selected Hyperagent after the gateway failed. Its live authenticated
workspace exposes Fable 5.1, GLM 5.3 (separate from Flash), Kimi K3 and Astra.
The first [Fable attachment canary](https://hyperagent.com/thread/cmto97y9s033r06ad63nd6yof)
returned 12 correct decisions, but used a file-reading tool despite the tool-free
contract. Its $3.99 spend and failed transport constraint are retained separately.

A temporary isolated eval agent was then configured: pinned Fable 5.1, Medium
effort, $1 enforced per-query cap, ten-minute timeout, no tools/integrations,
curated empty memories, learning/global skills/thread search off. Inputs are
inline, with source hashes matching the frozen v2 files. Existing production
agent defaults and shared billing settings were preserved. The corrected canary
passed all 12 cases with no tool calls at $0.70. All three baseline and all three candidate trials completed: **36/36 decisions
for each variant**, no observed tool calls, all under the $1 per-query cap.
[Hyperagent receipts](hyperagent-results.json) retain the six thread URLs, actual
decisions (deduplicated only after comparing every parsed response), source hashes,
model/effort, and the Usage breakdowns.

Displayed costs: baseline $0.35 / $0.35 / $0.35; candidate $0.70 / $0.69 / $0.33.
The paired total is $2.77, or $6.76 including the failed attachment preflight.
The candidate cost more across this small set. Cache state and exact input-token
counts were not exposed here, so these observations do not establish a cheaper
prompt or a cause for the variation. The earlier $3.99 → $0.70 improvement changed
the evaluation setup, not just repository prose. We claim preserved decisions and
smaller entry files, not a universal cost/performance win.

Hyperagent currently says per-query dollar caps apply only to Claude. The user
explicitly approved six GLM and six Kimi trials without enforced dollar caps:
one response each, tools off, ten-minute timeout, and a $5 combined observed-spend
stop. This supersedes the local operator skill's cap requirement for this bounded
batch only. The displayed $1 setting is not treated as enforced for these models.
Neither GLM nor Kimi exposes an effort control in this configuration; record
host default rather than copying Fable's Medium setting.

All six GLM and all six Kimi trials completed with no observed tool calls. Each
model scored **36/36 baseline and 36/36 candidate decisions**. Every parsed output
was compared to the retained actual response before deduplication, then regraded
with the strict shared grader. No model substitution or assertion relaxation was used.

Displayed GLM paired spend: **$0.47**. Kimi paired spend: **$0.87**.
The approved GLM/Kimi batch used **$1.34 of the $5 observed-spend stop**.
Total Hyperagent spend including Fable and the failed attachment preflight:
**$8.10**. These rounded UI totals are observed usage, not hard-cap enforcement.

Combined decision evidence: **24 fresh paired trials, 288/288 decisions**, split
equally between baseline and candidate across four exact selected models. UI model
labels and per-model usage identify the Hyperagent runs; internal host build IDs,
exact token counts and end-to-end latency were not exposed or captured. No native
compaction/resume, provider-history integration, hosted CI or release proof is claimed.

## Landing refresh

Replayed only this refactor onto main `0064941c52`; the inherited unrelated CI
commit was excluded. Preserved newer main policy for legacy labels, marketing
H1 visual lines, Scene Palette v1, and interaction activation counts. Refreshed
preservation hashes from that main source and regenerated the design manifest.
The 288-decision live receipt above remains evidence for its frozen input hashes,
not a claim that provider trials were repeated on this updated landing tree.
