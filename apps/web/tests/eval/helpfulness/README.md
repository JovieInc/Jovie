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
