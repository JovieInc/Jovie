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
   exact component module and uses that binding as a JSX tag, calls or
   constructs it directly, or passes it as argument zero to an explicitly
   imported React/test renderer; or asserts an exact `node:fs` read of that
   source from `readFileSync` argument zero. Comments, mocks without a real
   import, same-name text, `void`/assignment/metadata mentions, local fake
   renderers, wrong-argument paths, and unasserted reads do not count.
   Existing components may also use a changed central test with the same
   executable evidence. Newly added components may not use the central-test
   exception.
2. **Story** — colocated `*.stories.ts(x)`. Existing marketing/site components
   may use a verified real-component story in the canonical
   `MarketingRecipes`, `MarketingSections`, or `MarketingShells` catalog;
   newly added components still require an adjacent story.
3. **Match** — story imports the real component module; required public props
   appear in story args/JSX (or `parameters.jovie.uncoveredProps` allowlist);
   disabled/loading props are exercised when present on the component API.
   Canonical catalog stories scope evidence to the component's own JSX and use
   `parameters.jovie.uncoveredPropsByComponent` for any explicit exemption, so
   unrelated stories and components cannot satisfy the match.
4. **Hygiene** — `pnpm storybook:quality` (no pure-black voids, no fake CTAs).
5. **Ratchet** — multi-root floors in `scripts/story-coverage-baseline.json`
   may only improve; new uncovered components fail even if percent holds.
6. **Rendered certification (JOV-5400 / JOV-5438)** — source-blind fail-closed evaluator
   for applicable design, copy, accessibility, interaction, layout-stability,
   theme, semantic-variant, tokenized-padding, and concentric-radius invariants.
   Deliberate-red fixtures must block; the current design-system landing batch
   emits exact-head pass/block receipts. The same receipt records the Shadcn /
   Typeset outcome inventory for the enrolled primitive batch (MIT public
   references only; missing/unknown benchmark dimensions fail closed).
7. **Live rendered evaluation (JOV-5721)** — computed DOM/axe/zoom/hover/keyboard/token/screenshot evidence for changed stories when `--require-rendered --storybook-url=<url>` is used; advisory unless required.
8. **Live Storybook certification (JOV-5454)** — build and serve the real web
   Storybook, resolve the canonical Badge/Button/Card story inventory by exact
   story id and import path, then evaluate those stories at desktop and compact
   viewports from computed browser evidence. Fail closed on missing
   stories/contracts, theme/surface mismatch, semantic drift, off-token
   padding/radius, geometry/anatomy drift, nonconcentric edges, AA contrast,
   axe, overflow/200% zoom, keyboard gaps, hover layout shift, placeholder
   copy, emoji/checkmarks, and decorative caps. This is the enrolled primitive
   proof path only; it does not certify unenrolled product routes.
8. **Founder-review rendered-layout claims (JOV-INV-024)** — a line-count,
   wrap, truncation, or breakpoint claim requires computed browser evidence
   from a user-accessible route built from the exact reviewed head, after fonts
   settle, at every declared compact, medium, and wide width. The receipt must
   preserve the complete authored accessibility name and record exact-head
   provenance. Local/raw artifacts, source or CSS inspection, and screenshots
   without both computed geometry and provenance are supporting evidence only.

### Commands

```bash
pnpm component-ship-gate          # diff + match + quality + ratchet + rendered cert + rendered eval + live Storybook cert
pnpm story-coverage:check         # multi-root ratchet only
pnpm story-coverage:update        # explicit floor raise (never silent)
pnpm storybook:quality            # story hygiene only

# Founder-review route certification; fails closed without a public URL and full exact head.
REVIEW_CERTIFICATION_REQUIRED=1 REVIEW_EXPECTED_HEAD_SHA=<full-sha> \
  BASE_URL=https://<review-host> E2E_SKIP_WEB_SERVER=1 \
  pnpm --filter @jovie/web exec playwright test \
  tests/e2e/homepage-quiet-hero.spec.ts \
  --config=playwright.config.noauth.ts --project=chromium
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
