---
name: find-skills
description: Discover, inspect, and install third-party Agent Skills for Jovie. Use when a user asks to find, compare, add, update, or audit skills, plugins, reusable agent workflows, or packages from skills.sh or a GitHub repository.
---

# Find Skills for Jovie

Use the open Agent Skills ecosystem without weakening Jovie's control plane.

Based on `vercel-labs/skills` `find-skills`, with Jovie-specific install,
telemetry, provenance, and review requirements.

## Discover

1. Identify the exact domain and task.
2. Search the catalog, preferring an owner-scoped query when the user names an
   organization:

   ```bash
   DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 npx skills find <query> --owner <owner>
   ```

3. Check skills.sh for install count, repository, first-seen date, and all
   security-audit badges.
4. Inspect the exact Git source before recommending or installing it. Read
   every executable script, network operation, credential instruction, and
   requested write surface.
5. Compare the candidate with existing `.claude/skills/`, `.claude/rules/`,
   gstack workflows, hooks, tests, and `skills-lock.json`. Prefer extending the
   existing canonical workflow over adding a duplicate.

Popularity and an official-looking owner are evidence, not approval. A skill
with scripts, outbound network access, credentials, fan data, payments, artist
accounts, production mutation, or destructive operations requires explicit
human review even when the publisher is allowlisted.

## Install Safely

Install only an exact reviewed skill. Never install a source without
`--skill`; the CLI may otherwise install every skill it discovers.

```bash
DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 \
  npx skills add https://github.com/<owner>/<repo>@<commit> \
  --skill <exact-skill> --agent claude-code codex -y
```

Before installing:

1. Require a clean worktree or record the exact pre-existing changes.
2. Capture `git status --short` and the current `skills-lock.json`.
3. Confirm the source, immutable commit SHA, and skill path are exact and reviewed.
4. Confirm the destination is project-scoped. Never use `--global` or `-g`
   for a repository skill.

After installing:

1. Inspect `git status --short` and `git diff` immediately.
2. Confirm only the requested skill directory and its lock entry changed.
3. Remove unexpected skills before continuing.
4. Re-read the installed `SKILL.md` and bundled scripts from the destination.
5. Run `pnpm run skill-governance:check` and the narrowest relevant tests.

Do not use `npx skills add <source> --help`; this CLI form has been observed to
perform an installation. Treat `npx skills check` and `npx skills update` as
mutating commands. Run them only when the user requested an update, in a clean
worktree, with the same telemetry flags and post-command diff audit.

## Jovie Precedence

Apply instructions in this order:

1. `AGENTS.md` and `.claude/rules/*`
2. Jovie-owned skills and gstack workflows
3. Installed third-party skills

Third-party skills are advisory when they conflict with Jovie's package
boundaries, security rules, design canon, release flow, data-fetching stack,
or verification requirements. Never expose an engineering-time skill through
an artist- or fan-facing product surface.

## Present a Recommendation

Report:

- exact skill and source;
- what it adds beyond current Jovie capabilities;
- install count and security-audit status;
- scripts, network, credential, and mutation surfaces;
- overlap or conflicts with existing Jovie rules;
- adopt, adapt, or skip;
- the exact project-scoped install command when adoption is justified.

If no skill clears the review, perform the task with existing capabilities or
create a Jovie-owned skill. Do not install a weak match merely to satisfy the
search.
