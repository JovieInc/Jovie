<!--
spec-version: 1.0.0
doc-freshness: docs/design-system/MEDIA_GENERATION.md
linear: JOV-13852
-->
# Media generation — inventory, owner, routing

**Owner:** Design System Consolidation (Linear project P-JOV-41 / JOV-13852).
**Machine inventory:** [`media-generation-routes.json`](./media-generation-routes.json)
**Check:** `node scripts/design/media-generation-routes-check.mjs`

This is the single routing doc for image / video / shader / gen paths. New
generation work must land under an existing lane below (or extend the JSON +
this doc in the same PR). Do not invent a parallel entry point.

Policy specs stay where they are: marketing look in
[`docs/marketing/IMAGERY.md`](../marketing/IMAGERY.md); product album-art
contract in [`docs/album-art-generation.md`](../album-art-generation.md).
Runtime motion/shaders (not pixel gen) stay in
[`.claude/skills/design-system/guides/motion.md`](../../.claude/skills/design-system/guides/motion.md).

## Routing table

| Intent | Lane id | Canonical entry | Status |
|---|---|---|---|
| Marketing plates / generated backgrounds | `marketing-media` | `apps/web/scripts/marketing-media/generate-image.ts` | **canonical** |
| Marketing factory orchestration | `marketing-factory` | `apps/web/scripts/marketing-factory/providers.ts` | consumer of `marketing-media` |
| Merch print graphics | `merch-graphic` | `apps/web/lib/merch/graphic-engine.ts` | **canonical** (product) |
| Album-art backgrounds | `album-art` | `apps/web/lib/services/album-art/provider-xai.ts` | **canonical** (product) |
| YouTube thumbnail challengers | `youtube-thumbnail` | `.claude/skills/youtube-thumbnail-growth/SKILL.md` | **canonical** (skill) |
| Agent UI mockups (gstack design binary) | `gstack-design` | `.agents/skills/gstack/design/src/generate.ts` | tooling only — never product/marketing SoT |
| Homepage hero WebGL field | `hero-light-shader` | `apps/web/components/homepage/hero-light/hero-light-gl.ts` | runtime shader (exception receipt); not image gen |
| Figma MCP shaders / generative plugins | `figma-bridge` | Figma MCP (`create_shader` / plugins) | optional bridge only; never publishable SoT |
| Merch quality / alpha spikes | `merch-spike` | `apps/web/scripts/merch-*-spike.ts` | **aliased →** `merch-graphic` (throwaway) |

## Lane notes

### `marketing-media` (canonical marketing gen)

- Adapter interface: `image-adapter.ts`. Providers: `fal-image-adapter.ts`,
  `codex-image-adapter.ts`; capture (not gen): `capture-adapter.ts`.
- Pipeline owns provenance + art gate (`generate-image.ts` →
  `scripts/vision/art-evaluator.mjs`) and the
  `media-export-seam.ts` export contract.
- Recipes / roles: `apps/web/data/marketing/mediaRecipes.ts`,
  `modelRoles.ts` (`image-gen`, `video-gen`). Video today is
  `hyperframes/composition` (local), not a second image stack.
- Factory (`marketing-factory/providers.ts`) must call this lane; do not
  add a third adapter tree beside `marketing-media/`.

### `merch-graphic` / `album-art` (product)

- Both use AI SDK `generateImage` via the Vercel AI Gateway
  (`apps/web/lib/ai/sdk.ts`). Merch roster lives in `graphic-engine.ts`;
  album-art model + Sharp overlay in `docs/album-art-generation.md`.
- Spikes under `apps/web/scripts/merch-*-spike.ts` are throwaway proofs —
  route new merch gen through `graphic-engine.ts`.

### `gstack-design` / `figma-bridge` / `hero-light-shader`

- gstack `design` binary = agent mockup CLI (OpenAI image tool). Not a
  product or marketing generator; do not wire app features through it.
- Figma MCP shaders/plugins = scratch/export only (Pen remains SoT).
- Hero-light WebGL is a documented runtime exception, not a gen pipeline.

## Storage

Prefer Cloudflare R2 for Project-owned object storage (Project preference).
Album-art candidates today use `@vercel/blob`
(`apps/web/lib/services/album-art/storage.ts`) — candidate follow-up
JOV-13875; do not add new Vercel Blob stores for design-system media.

## How to add a path

1. Prefer extending an existing lane.
2. Update `media-generation-routes.json` + this doc in the same PR.
3. Run `node scripts/design/media-generation-routes-check.mjs`.
4. Point any temporary script at the canonical entry in its header comment.
