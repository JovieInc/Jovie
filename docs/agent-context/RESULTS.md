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
  skill governance and OKLCH guard. Run with repo-pinned Node 24.22.1.
- 5 existing Vitest design-policy tests pass: icon alignment and layout stability.
- Manifest freshness, document freshness, skill governance, palette guard,
  gstack generation dry-run, skill-size check, Biome and whitespace checks pass.
- Preservation checks cover all 20 original design sections and all 19 rule bodies
  (gstack's authority correction and Pen's relocated registry guard are explicit changes).

## Live trials and failures

Raw structured results were archived off-tree (Size Guard offset). Expected
answers were withheld; models received case inputs and decision field names. Pass
requires every case and no extra claims, with key order ignored. These deliberately
small cases primarily measure instruction compliance, not problem-solving ability.
Baseline also passed.

Astra used `/Applications/ChatGPT.app/Contents/Resources/codex exec`, with
`--ignore-user-config --ephemeral --skip-git-repo-check -s read-only -m gpt-6-astra`.

## Archive note

Long-form eval trial narrative archived off-tree for Size Guard headroom.

