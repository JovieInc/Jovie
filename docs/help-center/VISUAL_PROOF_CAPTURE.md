# Help Center visual proof capture (JOV-5900)

Deterministic screenshot pipeline for Help Center guides. Captured assets are
committed under `apps/docs/public/proof/` so articles ship the current product
and can be recertified when the UI changes.

## Pipeline

1. **Plan** — `apps/web/tests/docs-guides/plan.json` maps each
   `{articleId, step}` to a route, `waitFor` selector, viewport, theme, and
   optional crop/interaction. `plan.ts` validates ids and derives the stable
   asset name `proof/<articleId>-<step>.png` used by `visualProofRefs`.
2. **Persona** — `persona.ts` defines the seeded documentation persona
   (`Example Artist`, `docs-example`). Authentication comes from the shared
   E2E bootstrap (`tests/e2e/auth.setup.ts` → `tests/.auth/user.json`), never
   from hand-maintained credentials.
3. **Capture** — `capture.spec.ts` under
   `playwright.config.docs-guides.ts`: fixed clock, reduced motion, pinned
   1440×900 / 390×844 viewports at 2x scale, dev overlays asserted hidden, and
   the DOM sanitizer strips emails, tokens, UUIDs, timestamps, and user
   widgets before each shot.
4. **Manifest** — `apps/docs/public/proof/manifest.json` records ref, route,
   viewport, theme, build SHA, capture timestamp, dimensions, and sha256 per
   asset. Unchanged images keep their prior `capturedAt`/`gitSha`
   (`resolveScreenshotEvidence`), so repeated runs on the same build produce
   materially stable assets and metadata.

## Certification

`node scripts/help-center-visual-assets.mjs audit` fails on:

- `missing-asset` — a `visualProofRefs` entry or plan step has no file.
- `orphaned-asset` — a proof PNG no article references.
- `duplicate-asset` — identical sha256 under two refs.
- `invalid-dimensions` — below the 640×320 floor or a page capture that does
  not match `viewport × deviceScaleFactor`.
- `stale-capture` — captured before the article's `lastVerifiedAt`.
- `stale-build` — manifest `gitSha` differs from HEAD.
- `unsafe-ref` / `unsafe-plan-text` — sensitive patterns in refs or plan copy.

`... issues` prints one remediation payload per affected article
(fingerprint `docs-visual-proof:<articleId>`); `--sync-linear` upserts them so
a failed capture files actionable evidence instead of silently keeping stale
imagery. Reviewers compare the manifest entry and PNG to the guide and flip
`status`/`verifiedBy` per `ARTICLE_METADATA.md`.

## Path-scoped re-capture

`node scripts/help-center-visual-assets.mjs affected --base <sha> --head <sha>`
reuses `findAffectedArticles` (route changes, feature state changes,
`productSourceRefs` path matches) and prints the plan entries to re-run:

```bash
pnpm --filter web docs-guide-shots -- --grep "<articleId|...>"
```

CI should invoke `affected` for changes under `apps/docs/**`,
`apps/web/constants/routes.ts`, `docs/FEATURE_REGISTRY.md`, or any
`productSourceRefs` path, and run only the returned entries. The full set runs
only when the integration certification issue requests it — there is no
nightly screenshot cron.
