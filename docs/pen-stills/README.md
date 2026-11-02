# Pen stills

Dark is the primary review mode. Light is a derived variant. The homepage
headline stays locked: **Be found. Be understood.**

Canonical section stills are not in the repo yet. The diff is advisory until
those PNGs land. Parked and fork frames stay in the manifest so the exclusion
is explicit, and they are never captured.

## Manifest

`homepage/manifest.json` is a `pen-still-manifest/v1` document. The schema is
`manifest.schema.json`. Each frame names `sectionId`, `penNodeId`, `fileHash`
(`sha256:` or `null`), `stillPath`, `viewport` (`1440` or `390`), `mode`
(`dark` or `light`), and `status` (`active`, `parked`, or `fork`). Only
`active` frames are diffed. Dark frames are compared first.

Optional `route`, `story`, `sectionSelector`, and `mockupSelector` tell the
capture which page and element to shoot. A story URL wins when
`PEN_STILL_STORYBOOK_URL` is set. Otherwise `PEN_STILL_BASE_URL` plus `route`
is the target.

## Diff

```bash
node scripts/invariants/pen-still-diff.mjs \
  --manifest docs/pen-stills/homepage/manifest.json \
  --out pen-still-out
```

Capture reuses `captureSurfacePng` and `withCaptureBrowser` from
`scripts/invariants/clef-screenshot-evaluator.mjs` (Playwright, viewports
1440 and 390, dark unless the frame says light).

Each comparable frame reports section height ratio (render aspect / Pen
aspect), mockup bbox aspect and area, text-block vertical centers, windowed
SSIM against `PEN_STILL_TOLERANCES`, and a Pen | render | diff triptych.

`--strict` exits 1 when a comparable frame misses tolerance. The default is
advisory and exits 0. A missing PNG is `waiting`. When nothing is comparable
the run still writes a synthetic triptych. That image is not a design verdict.

`.github/workflows/pen-still-diff.yml` is not a required check. It posts the
triptych on the pull request and uploads the same PNG as an artifact.
