# Marketing image grading

Every image on a marketing page is recolored for color harmony (founder, Nov 22
2026). The manifest `marketing-image-grading.json` lists every raster image
referenced from marketing pages and the homepage, with status, method, who
graded it and when.

## Allowed methods

- `hue-by-hue-photographic-grade`: a photographic grade with hue-versus-hue
  precision sliders, one hue at a time. Status `graded-hue`.
- `regeneration-under-color-rules`: AI image generation recreating the image
  with the new color rules. Status `regenerated`.

## Banned

A LUT thrown on and called done, blanket filters, overlays or tints, and any CSS
`filter`, `hue-rotate`, `sepia`, `saturate` or `mix-blend` recolor on marketing
`img`, `picture` or `Image` elements. Never recolor by sloppy editing.

## Enforcement

`scripts/invariants/art-direction/marketing-image-grading.mjs`, run by
`pnpm invariants:check`:

- a new marketing image that is not in the manifest fails;
- a graded entry needs an allowed method, `gradedBy` and `gradedAt`;
- the ungraded set is shrink-only against origin/main, so new images arrive
  already graded;
- CSS recolor on marketing images fails, with pre-existing hits in
  `marketing-image-recolor.baseline.json` (shrink-only).

Status values: `ungraded`, `graded-hue`, `regenerated`. Regenerate the manifest
skeleton with `node scripts/invariants/art-direction/marketing-image-grading.mjs --write`.
