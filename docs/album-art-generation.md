# Album Art Generation

Album art generation is implemented as a paid Jovie chat skill. Release action menus launch chat with a stored prompt, the `generateAlbumArt` tool creates three candidates, and the user explicitly applies one candidate to a release.

## AI SDK And Vercel AI Gateway

Album art backgrounds are generated in `apps/web/lib/services/album-art/provider-xai.ts` with AI SDK image generation through the Vercel AI Gateway. The call uses the same Gateway provider as the rest of the app (`apps/web/lib/ai/sdk.ts`): `AI_GATEWAY_API_KEY` when set, otherwise Vercel OIDC on deployed runtimes. A direct `XAI_API_KEY` is not required.

```ts
const result = await generateImage({
  model: gateway.image(modelId),
  prompt,
  aspectRatio: '1:1',
  n: 3,
});
```

The model id lives in `ALBUM_ART_GATEWAY_IMAGE_MODEL` (`spacexai/grok-imagine-image`). Gateway catalog price on 2026-09-25 is $0.02 per image. Each generation requests three images.

Runtime configuration:

```txt
AI_GATEWAY_API_KEY          # local/CI only; Vercel production uses OIDC
ALBUM_ART_IMAGE_MODEL       # optional provider/model override
ALBUM_ART_GENERATION_DAILY_LIMIT=6
ALBUM_ART_GENERATION_BURST_LIMIT=2
```

If `ALBUM_ART_IMAGE_MODEL` is unset, or set to a legacy bare id such as `grok-imagine-image`, Jovie uses `spacexai/grok-imagine-image`. An override is used only when it contains a provider prefix (`provider/model`).

## Backgrounds Only

Grok generates only the text-free background. Provider prompts explicitly forbid words, letters, typography, logos, stickers, label names, advisory marks, and text-like symbols. Jovie owns every visible text element because model-rendered typography is unreliable and hard to audit.

## Locked Text Rendering

`apps/web/lib/services/album-art/render.ts` uses Sharp to produce deterministic 3000x3000 covers. It overlays an escaped SVG containing only:

- Release title
- Artist display name

The renderer wraps long titles, reduces font size inside style-specific bounds, and visually truncates only the overlay if text still cannot fit. Full release metadata remains unchanged.

## Style Presets

`apps/web/lib/services/album-art/styles.ts` defines these preset IDs:

- `neo_pop_collage`: Saturated digital collage, pop pink/cyan/yellow, surreal glossy 3D details, high contrast.
- `chrome_noir`: Black, silver, smoke, hard light, cinematic object composition.
- `analog_dream`: 35mm grain, soft bloom, muted color, photographed objects, worn paper texture.
- `minimal_icon`: Central symbol, restrained palette, clean negative space, editorial cover.

Each preset includes `id`, `label`, `description`, `backgroundPrompt`, and `overlayTheme`. Do not put artist references like Beeple in provider prompts; use descriptive style language only.

## Blob Paths

Generated candidates are stored as previews and full-res images:

```txt
artwork/generated/{profileId}/{generationId}/{candidateId}.jpg
artwork/generated/{profileId}/{generationId}/{candidateId}-preview.jpg
artwork/generated/{profileId}/{generationId}/manifest.json
```

Applied release artwork uses the existing release artwork path shape:

```txt
artwork/releases/{releaseId}/{sizeKey}.avif
```

Generated artwork is processed through the same size pipeline as manual uploads: `original`, `1000`, `500`, and `250`.

## Metadata Contract

Applying generated artwork preserves rollback metadata from the manual upload flow. On first replacement, Jovie stores the existing DSP/manual artwork in:

```ts
metadata.originalArtworkUrl
metadata.originalArtworkSizes
```

Then it writes:

```ts
metadata.artworkSizes
metadata.generatedArtwork
```

`generatedArtwork` records provider, model, style ID, generation ID, candidate ID, prompt, and applied timestamp. The revert UI is not part of V1, but the metadata is intentionally preserved for a later revert surface.

## Entitlements And Rate Limits

The server gate is `canGenerateAlbumArt`; do not use `aiCanUseTools` because free users can currently use chat tools. The UI flag `FEATURE_FLAGS.ALBUM_ART_GENERATION` controls visibility only and is not trusted by API routes.

Rate limits are dedicated to this skill because one chat tool call generates three images and writes Blob objects:

- Daily: `ALBUM_ART_GENERATION_DAILY_LIMIT`, default 6 per user
- Burst: `ALBUM_ART_GENERATION_BURST_LIMIT`, default 2 per minute per user

429s return retryable chat-card errors and do not write release rows.

## Troubleshooting

If generation fails immediately, verify Gateway auth: on Vercel, OIDC is injected automatically (`VERCEL=1`); off Vercel, `AI_GATEWAY_API_KEY` must be set. Confirm the configured Gateway image model supports AI SDK `generateImage`. If candidates render but apply fails, verify Blob auth (Vercel OIDC via `BLOB_STORE_ID` in deployed envs, or the static `BLOB_READ_WRITE_TOKEN` in local dev) and that the generated manifest exists under the expected Blob prefix.

## Known Limitations

V1 generation is synchronous inside the chat request. There is no generation history UI, reference-image remix, typography editor, moderation queue, or async job persistence yet.

## Downtime AI Follow-Up

1. Persist generation jobs in DB.
2. Add generated-art history/gallery.
3. Add typography/layout editor.
4. Add uploaded reference image remix.
5. Add parental advisory toggle.
6. Add moderation/safety pass.
7. Add cost telemetry per model call.
8. Add async queue for slow providers.
9. Add admin debug gallery.
10. Add prompt evals per style.
