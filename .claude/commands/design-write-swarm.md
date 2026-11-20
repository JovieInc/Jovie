Stand / run the design **write** swarm (JOV-13851).

1. Prefer dry first: `pnpm design:write-swarm:dry` (must print `mutatesPen: false`).
2. Read `docs/design-system/WRITE_SWARM_PATH.md` and `.claude/rules/pen.md`.
3. Live only with Tim’s open canvas (`pen interactive -a desktop`, lock
   `jovie-founder-design-studio`) and a pen-review lease token.
4. System-1 = `scripts/pen-review` panel — never writer self-approve.
5. Code sync = atomic tokens / `packages/ui` PR; no `*.pen` blobs.

```bash
pnpm design:write-swarm:list
pnpm design:write-swarm:dry
pnpm design:write-swarm:test
```
