---
name: qa-swarm
description: |
  Agent-swarm QA recipes for continuous objective flaw discovery. Six recipes
  (diff-review, explore, vision-critique, design-jury, test-gen, flaky-hunter)
  propose enriched Linear issues, write findings to gbrain, and fast-track P0
  remediation without requiring Eve.
version: 2026-06-20
scope: JovieInc/Jovie
owner: ops-agent
---

# qa-swarm

Shared contract for GitHub issue #10937. Recipes are invoked via `/qa-swarm-*`
slash commands. All recipes end by calling the propose CLI so findings become
durable Linear issues plus gbrain pages.

## Autonomy contract

- Recipes **propose** findings; Eve may curate/re-rank when enabled.
- **P0/breaking** findings always write a remediation manifest under
  `.context/qa-swarm/remediation/` for a `coder` agent — Eve is optional.
- If Eve is down (`--eve-enabled` omitted), shipping continues: issues still
  file, P0 still fast-tracks.
- Never block merge on Eve availability.

## Shared propose step (every recipe)

After collecting findings, write `findings.json` and run:

```bash
node scripts/qa-swarm/cli.mjs propose \
  --recipe <recipe-id> \
  --input .context/qa-swarm/runs/<run-id>/findings.json \
  [--dry-run] \
  [--eve-enabled]
```

Finding shape:

```json
{
  "findings": [
    {
      "id": "unique-id",
      "recipeId": "diff-review",
      "title": "Short title",
      "summary": "What is broken and where.",
      "priority": "P0",
      "kind": "objective",
      "evidencePaths": ["path/or/url"],
      "reproduction": "optional command or URL",
      "surface": "optional surface id"
    }
  ],
  "sourceIssue": "JOV-3212",
  "branch": "codex/..."
}
```

## Recipe workflows

### diff-review (`/qa-swarm-diff-review`)

1. Resolve base branch (`origin/main`) and current diff.
2. Run `/review` on the diff.
3. Run `/benchmark-models` or `/claude challenge` for a second model pass on
   high-risk hunks (auth, billing, DB, proxy).
4. Emit one finding per blocker; P0 for security, money, or broken core flows.
5. Propose via CLI.

### explore (`/qa-swarm-explore`)

1. Start browse-compatible dev server: `pnpm run dev:web:browse`.
2. Auth via `/api/dev/test-auth/enter?persona=creator-ready&redirect=/app`.
3. Run `/qa --quick` on changed routes; extend with `/browse` goal scripts for
   untested paths.
4. For iOS changes, run `/ios-qa` against a real build when available.
5. Propose console errors, dead ends, and broken flows.

### vision-critique (`/qa-swarm-vision`)

1. Capture before/after screenshots for affected surfaces.
2. Score polish 1-10; flag `broken` when unusable, `janky` when polish < 6.
3. Use `/design-review` for fixable objective issues; tag taste-only as `kind:
   taste` with lower priority.
4. Attach screenshot paths in `evidencePaths`.
5. Propose findings.

### design-jury (`/qa-swarm-design-jury`)

1. Use change-aware capture: only screens touched by the diff (see #10939).
2. Load taste memory from `apps/web/lib/agent-os/design-lab/taste-memory.ts`
   paths when available.
3. Run multi-model jury (`/plan-design-review`, `/design-shotgun`) and rank
   consensus as ship vs taste.
4. Objective deltas file as `kind: objective`; pure taste as `kind: taste`.
5. Propose findings with `referenceComp` when a benchmark app applies.

### test-gen (`/qa-swarm-test-gen`)

1. Run `pnpm --filter @jovie/web run test:nightly-agent:select` for targets.
2. Prefer unit/integration over E2E; fuzz parsers, sync contracts, entitlement
   states.
3. Keep only candidates that pass focused runs.
4. File gaps as `kind: coverage` findings when generation is not attempted in
   this session.
5. Propose findings.

### flaky-hunter (`/qa-swarm-flaky-hunter`)

1. Run `pnpm run test:flaky` and inspect CI flake clusters.
2. Re-run suspect tests 3x locally; confirm stable reproduction.
3. Update `apps/web/tests/quarantine.json` only after stable repro.
4. File fix findings as P0/P1; quarantine-only entries as `kind: flake`.
5. Propose findings.

## Verification

```bash
pnpm qa:swarm:test
node scripts/qa-swarm/cli.mjs list
```

## Do not

- Skip the propose CLI — findings must reach Linear + gbrain.
- Auto-merge remediation PRs for auth, billing, DB, or proxy without `needs-human`.
- Depend on Eve for P0 response.
