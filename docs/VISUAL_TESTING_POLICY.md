# Visual Testing Policy

Canonical contract for Storybook + visual evidence on shippable UI (JOV-4421).

## Shippable surfaces

| Surface | Required |
| --- | --- |
| `packages/ui/atoms/**` | test + story + match |
| `packages/ui/**` (other top-level components) | test + story + match |
| `apps/web/components/atoms/**` | test + story + match |
| `apps/web/components/molecules/**` | test + story + match |
| `apps/web/components/organisms/**` | test + story + match |
| `apps/web/components/marketing/**` | test + story + match |
| `apps/web/components/site/**` | test + story + match |

**Excluded:** `*.utils.ts`, pure types, index barrels, lazy wrappers, route
`page.tsx` / `layout.tsx`, generated code, Storybook-only fixtures, hooks under
`packages/ui/hooks`.

## Hard ship gate

`pnpm component-ship-gate` fails closed when a **changed** shippable component
source lacks:

1. **Test** — colocated `*.test.ts(x)` / `*.spec.ts(x)`, **touched in the same
   diff**, or a verified `// @coverage-via <path>` whose target imports the
   component.
2. **Story** — colocated `*.stories.ts(x)`.
3. **Match** — story imports the real component module; required public props
   appear in story args/JSX (or `parameters.jovie.uncoveredProps` allowlist);
   disabled/loading props are exercised when present on the component API.
4. **Hygiene** — `pnpm storybook:quality` (no pure-black voids, no fake CTAs).
5. **Ratchet** — multi-root floors in `scripts/story-coverage-baseline.json`
   may only improve; new uncovered components fail even if percent holds.

### Commands

```bash
pnpm component-ship-gate          # diff + match + quality + ratchet
pnpm story-coverage:check         # multi-root ratchet only
pnpm story-coverage:update        # explicit floor raise (never silent)
pnpm storybook:quality            # story hygiene only
```

Enforcement: `ci-fast` structural lane (required PR + merge_group check) and
pre-push affected gate.

## Story matrix (default)

When applicable, stories should cover:

| State | When |
| --- | --- |
| Default | Always |
| Disabled | Component exposes `disabled` |
| Loading | Component exposes `loading` / `isLoading` |
| Empty / error | Async or data-bound components |
| Long content | Labels/titles that truncate |
| Narrow | Layout-sensitive composites |

## Metrics & ratchets

- Story coverage % per root: **lock_up** only
- Uncovered component count per root: **must not increase**
- Interaction-story % (optional): `scripts/visual-quality-metrics.mjs`

See also: `docs/UI_STORY_COVERAGE_ROLLOUT.md` for the shadow audit workflow.
