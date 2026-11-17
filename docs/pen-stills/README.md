# Pen stills

Dark is the primary review mode. Light is a derived variant. The homepage
records the historical headline **Be found. Be understood.** This
manifest and headline are unqualified inputs, not approval of the current
homepage or authority to change its copy or Pen IDs.

The homepage stills in `home/<viewport>/<section>.png` are the approved
homepage v3 (Tim, 2026-11-08 01:43Z, design-approvals receipt
home-canonical-v3): hero, profile, releases, specs, invite and footer at 1440
and 390. The page code marks the same sections with `data-pen-section`.

Other canonical section stills are not in the repo yet. Provide authorized exports
locally to qualify comparisons; do not commit native images or upload private
screenshots. The default diff remains advisory. Parked and fork frames stay in
the manifest so the exclusion is explicit, and they are never captured.

## Manifest

The binding manifest is `docs/design-system/pen-bindings.json`
(`jovie.pen-binding/v1`, schema `docs/design-system/pen-bindings.schema.json`):
routes, their `sources`, an `approved` receipt, and per-viewport sections with
`penFile`, `nodeId`, `still` and `sha256`. A route without `approved` is
UNBOUND. Stills live at `docs/pen-stills/<slug>/<viewport>/<section>.png`.
Write them with `pnpm design:pen-export`, record approval with
`pnpm design:pen-export approve`, check with `pnpm design:pen-bindings`.
`pen-still-diff` reads that file and turns bound routes into dark, active
frames. The legacy `pen-still-manifest/v1` frame format below still loads for
fixtures (`manifest.schema.json`). Each frame names `sectionId`, `penNodeId`, `fileHash`
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
  --manifest docs/design-system/pen-bindings.json [--route /] \
  --out pen-still-out
```

Capture reuses `captureSurfacePng` from
`scripts/invariants/clef-screenshot-capture.mjs` (Playwright, viewports
1440 and 390, dark unless the frame says light). One browser starts lazily
for the manifest and closes after evaluation. Each frame retains its own
isolated page/context and closes it even after a capture failure. Missing
stills, failed hashes and absent targets do not start Chromium.

Each comparable frame reports section height ratio (render aspect / Pen
aspect), mockup bbox aspect and area, text-block vertical centers, windowed
SSIM against `PEN_STILL_TOLERANCES`, and a Pen | render | diff triptych.

`--strict` exits 0 only when at least one active frame exists and every active
frame was compared and passed the existing tolerances. Missing stills or capture
targets remain `waiting` but fail strict qualification, including mixed
pass/waiting runs. Hash mismatches, unavailable captures, unreadable PNGs and
out-of-tolerance comparisons also fail. Parked and fork frames remain excluded.
Capture/read/decode failures are recorded as `comparison-unavailable` so other
frames can still produce evidence. Receipt `advisory` and `pass` reflect the
selected mode. Default advisory runs exit 0 for recorded comparison failures;
invalid manifests and other command errors still exit nonzero.

Each compared frame writes its own `triptych-<sha256>.png`, deterministically
named from its route/story, section, mode and viewport identity. Route and story
also scope duplicate detection, so two pages can retain independent `hero`
comparisons even when their native node IDs coincide. Full identity hashing avoids
path separators, case-folding collisions, lossy slug collisions and overlong
filenames. `receipt.json` and `comment.md` reference those exact images. A legacy
`triptych.png` alias is written only for one compared image (or the sole
synthetic sample), and removed when an output directory is reused for multiple
comparisons. All images remain together in the existing artifact directory.

The comment publisher attaches the exact generated filenames referenced in the
body, using byte-preserving temporary copies beside its temporary body file so
GitHub CLI can rewrite the references. It accepts only regular PNG files with
generated names from the output directory, rejects symlinks and unsafe paths,
and attaches at most 50 unique images. Missing, invalid and excess images become
plain artifact notices, never broken embeds. Original artifacts are preserved.

The publisher probes the installed CLI for `--attach` support. Unsupported CLIs
post text only. If an attachment attempt explicitly reports that no comment was
posted, the publisher retries once with all image embeds removed. Unknown or
network failures do not retry because publication may already have happened.
Previous comments are deleted only after a successful new post; a deletion
failure does not repost. The workflow's current permissions can prevent image
uploads, so a successful advisory job is not proof of hosted image delivery.

When no image pair was compared, `synthetic-triptych.png` exercises the harness.
It is explicitly labeled synthetic in the receipt and comment, never enters the
frame results or compared-frame artifacts, and cannot satisfy strict qualification.
Generated test fixtures prove harness behavior only, not design certification.

`.github/workflows/pen-still-diff.yml` is not a required check. It posts the
advisory comment on the pull request and uploads the output directory as an
artifact. This harness repair does not make that workflow a strict gate.
