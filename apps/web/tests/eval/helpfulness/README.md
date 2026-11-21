# Jovie helpfulness eval

Live runner, deterministic CI lane, and offline failure→delta harness for the
artist-facing assistant rubric.

## Live run (Workers AI credits only — never Gateway)

```bash
pnpm --filter @jovie/web eval:helpfulness -- \
  --judge cheap --subset ci --out /tmp/helpfulness-ci.json
```

## Offline failure → delta brief (ASS-22, $0)

After a live `--out` JSON exists, summarize gate metrics and failing dims
without another model call:

```bash
pnpm --filter @jovie/web eval:helpfulness:delta -- \
  --in /tmp/helpfulness-ci.json --top 3
```

Optional `--out /tmp/delta-brief.md` writes the markdown brief to disk.

Hermetic proof: `failure-delta.ci.test.ts` (picked up by
`vitest.config.golden-eval.mts` via `tests/eval/helpfulness/**/*.ci.test.ts`).

## Offline ASS-13 targets gate (ASS-27, $0)

Exit 0 iff median≥4.5, safety 100%, invented=0, one-rec≥90%. On fail, prints
Top themes (same heuristics as `:delta`). Offline only — pass an existing
`--out` JSON; never calls live models.

```bash
pnpm --filter @jovie/web eval:helpfulness:targets -- \
  --out /tmp/helpfulness-ci.json
```

Hermetic proof: `targets.ci.test.ts`.
