# No-Mistakes Pre-Push AI Validation Gate (OWL Pilot)

JOV-3200 wires [no-mistakes](https://github.com/kunchenguid/no-mistakes) into Jovie as the OWL "keep main green" lane for agent-authored changes.

## What it does

`no-mistakes` is a local git proxy. Push to the `no-mistakes` remote instead of `origin` and it:

1. Spins up a disposable worktree (your working tree stays untouched)
2. Runs review → test → docs → lint → push → PR → CI
3. Auto-fixes mechanical issues; escalates intent/product decisions
4. Forwards upstream and opens a PR only when every check is green

Repo-specific commands live in `.no-mistakes.yaml` and delegate to `scripts/hooks/pre-push-gate.sh` so husky and no-mistakes share the same checks.

## Pipeline commands (Jovie)

| Step | Command | What it runs |
| --- | --- | --- |
| **lint** | `bash scripts/hooks/pre-push-gate.sh lint` | `pnpm run pre-push`: biome check on changed files (full `biome check .` when no base ref), then proxy-guard + tailwind + typecheck. The single scoped biome step covers lint+format; the web `pre-push` no longer re-runs a repo-wide `biome lint .`. |
| **test** | `bash scripts/hooks/pre-push-gate.sh test` | `pnpm --filter=@jovie/web run test:fast` |
| **affected** | `bash scripts/hooks/pre-push-gate.sh affected` | The local git hook: fast lint gate, then affected typecheck, lint, and tests. |
| **format** | `bash scripts/hooks/pre-push-gate.sh format` | `pnpm biome check --write .` |

Equivalent package.json shortcuts:

```bash
pnpm run pre-push:gate        # lint profile
pnpm run pre-push:gate:test   # test profile
pnpm run pre-push:gate:affected  # affected typecheck, lint, and tests
pnpm run pre-push:gate:format   # format profile
pnpm run pre-push:gate:all    # lint + test (local dry-run)
```

## Setup (one-time per machine)

```bash
# Install no-mistakes CLI
curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh

# Initialize gate for this repo (adds no-mistakes remote + agent skill)
no-mistakes init
```

## Daily workflow

```bash
# Option A — explicit git remote
git push no-mistakes my-branch

# Option B — TUI wizard (uncommitted changes OK)
no-mistakes

# Option C — agent skill (headless)
no-mistakes axi run --intent "<what you set out to accomplish>"
```

After push, monitor with `no-mistakes` (TUI) or `no-mistakes axi status`.

## Escape hatches (do not block dev velocity)

| Situation | Bypass |
| --- | --- |
| Skip husky pre-push locally | `JOVIE_SKIP_PRE_PUSH_GATE=1 git push` |
| Skip all husky hooks | `HUSKY=0 git push` |
| Push without no-mistakes pipeline | `git push origin <branch>` (direct to GitHub) |
| Cancel an in-flight no-mistakes run | `no-mistakes axi abort` |
| Emergency hotfix | `hotfix/*` branch → `main` with `needs-human` label (see `.claude/rules/release.md`) |

The husky hook intentionally runs **lint only** (no tests) to keep local pushes fast. The no-mistakes pipeline adds tests, review, docs, and CI babysitting in the disposable worktree.

## Agent-local verification receipt

Before opening or updating a draft PR, autonomous shippers should run:

```bash
pnpm ship:verify -- --base origin/main
```

It classifies the diff with the checked-in CI harness, runs affected local checks plus the risk-required smoke/build commands, and writes a machine-readable receipt to `artifacts/verification/result.json` (ignored by Git). Add `--with-performance` for route-budget verification on performance-sensitive work. This is a fast feedback loop, not a CI replacement: the PR and merge paths still run independently in clean runners.

## Evidence artifacts

When `test.evidence.store_in_repo: true` in `.no-mistakes.yaml`, the test step may commit screenshots/logs under `.no-mistakes/evidence/<branch-slug>/` so reviewers see proof on the PR. Transient build caches are never committed.

## Related

- `.husky/pre-push` — local hook calling the same gate script
- `.claude/rules/release.md` — PR discipline and pre-push expectations
- Linear: [JOV-3200](https://linear.app/jovie/issue/JOV-3200)
