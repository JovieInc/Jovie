# design-sync (homepage) — notes and re-sync watch-list

Shape: **package** (pre-built esbuild dist, like `.design-sync-marketing/`).
Surface: the **homepage** (`apps/web/app/(home)/page.tsx`) section components.
Project: **not yet uploaded** — DesignSync auth was unavailable in the web session
(see "Upload status" below). `projectId` is therefore not yet pinned in config.json.

Scope is **homepage first** (this kit); the **dashboard/chat interface** is the
planned phase 2 and is NOT in this kit.

## Why package shape + pre-built dist (not the converter's own bundler)

Same converter bug the marketing kit documented: `lib/bundle.mjs`'s
`tsconfigPathsPlugin` mis-resolves this repo's wildcard `@/*` imports to
directories. We sidestep it: `prebuild.mjs` bundles the 13 sections with native
esbuild (resolves `@/*` + applies stubs) into `dist/homepage.mjs` (react
externalized); the converter re-bundles that module, which has no `@/*` left.

## One-command re-sync

```bash
# stage converter (once per clone)
mkdir -p .ds-sync && cp -r <skill>/package-*.mjs <skill>/resync.mjs <skill>/lib <skill>/storybook .ds-sync/
echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json
(cd .ds-sync && npm i esbuild ts-morph @types/react && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.60.0 playwright-core@1.60.0)
# build + verify + diff (driver). cfg.buildCmd runs gen-images + build-css + prebuild.
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules apps/web/node_modules \
  --entry .design-sync/dist/homepage.mjs --out ./ds-bundle [--remote .design-sync/.cache/remote-sync.json]
```

`cfg.buildCmd` = `gen-images.mjs && build-css.mjs && prebuild.mjs` (the converter
runs it before building).

## Kit-specific decisions (so a re-sync doesn't relearn them)

- **`pkg: apps/web/components` + `srcDir` + repo-root-relative `componentSrcMap`.**
  With `--entry`, the converter walks up to the repo-root `package.json`, so
  `PKG_DIR` = repo root. `srcDir` and every `componentSrcMap` path are therefore
  repo-root-relative (`apps/web/components/...`); shorter paths resolve to the
  wrong base (the repo-root `lib/`) and you get `0 src-matched`.
- **`dtsPropsFor` is authoritative for props.** Auto-extraction from app-source
  `.tsx` yields empty bodies (`[DTS_REACT]` — `@types/react` resolution off the
  repo-root walk-up). All 13 prop bodies are hand-written in `cfg.dtsPropsFor`
  (no-prop sections use a `/* No props … */` comment so they emit an empty
  interface instead of `[key: string]: unknown`). If a component's real props
  change, update `dtsPropsFor`.
- **`process` shim.** `prebuild.mjs` injects `globalThis.process = {env:{}}` via
  banner — components read `process.env.NEXT_PUBLIC_*` through lazy getters
  (`apps/web/lib/env-public.ts`, all `|| fallback`, safe when empty). Without the
  shim the bundle throws `process is not defined` on load and `window.JovieHome`
  never assigns.
- **Public-path images.** Components that do `<Image src="/public/path">` (only
  the Black Hole label logo today) won't load that path in the sandbox.
  `gen-images.mjs` emits a data-URI map → `dist/public-assets.json`; `prebuild.mjs`
  injects it as `globalThis.__DS_PUBLIC_ASSETS`; the `next/image` stub resolves
  srcs through it. Add new public-path assets to the `PUBLIC_ASSETS` map.
- **Preview images = data URIs.** `gen-images.mjs` downscales the repo's marketing
  screenshots to webp data URIs in `previews/_images.ts` (gitignored, regenerated
  by buildCmd). External `jov.ie` URLs do NOT render in the preview sandbox — use
  `IMG` from `./_images`, never absolute URLs.
- **Preview import form.** Authored previews import from the EXACT package string
  `'apps/web/components'` (e.g. `import { FaqSection } from 'apps/web/components'`).
  That triggers the story-imports shim's `export *` from `window.JovieHome`. A
  subpath import would NOT shim (the d.ts `exported` set is empty) and would try to
  re-bundle from source (the `@/*` resolver bug). Don't use subpath imports.
- **Dark by default; `HomeBentoPairs` is the one light band.** `build-css.mjs`
  rewrites `:root.dark → :root:root` so the carbon dark tokens apply to bare
  preview HTML. `HomeBentoPairs` is authored as a LIGHT section (`text-black` on
  `bg-(--color-bg-base)`); its preview scopes `--color-bg-base: #f5f5f5` so the
  heading reads. `cfg.provider = DesignSyncCanvas` wraps every cell in the dark
  carbon canvas.

## Known render warns (triaged — not new on re-sync)

- `[TOKENS_MISSING]` (~23 vars: `--radix-*`, `--tile-accent`, `--pill-accent`,
  `--tw`, a few spacing/line-height): radix runtime vars + values components set
  inline at runtime. Non-blocking; previews render correctly.
- `FridayRhythmSection` / `HomeLoopDiagramSection` have secondary paragraph text
  that is a **scroll-reveal** element (faded at rest in a static capture).
  Headlines + content render; graded good.

## CSS

Output `apps/web/.ds-design-sync-home.css` (~817 KB, gitignored). `build-css.mjs`
compiles `globals.css` (Tailwind v4, `source(none)` + `@source` scoped to the
homepage trees + `.design-sync/previews`), rewrites dark→default, and appends the
homepage's own `app/(home)/home.css` (5.3k lines of `.homepage-*` layout classes).

**Re-sync risk — CSS scoping:** if a homepage class is missing/unstyled, check the
`@source` dirs in `build-css.mjs` (relative to `apps/web/app/`, so `../components/...`;
the marketing kit's `../apps/web/...` double-nests and is WRONG — don't copy it).
If `home.css` moves or a section adopts new custom classes outside the homepage
trees, add its dir to `build-css.mjs`.

## Upload status (BLOCKER — do this when auth is available)

The local bundle is built, validated (13/13 render clean), and every cell graded
`good`. Upload did not run: `DesignSync` needed design-system authorization not
available in this web session ("Send to Claude Code Web", or run interactively).
To finish:

1. `DesignSync(create_project, name: "<pick non-colliding>")` — record the new
   `projectId` in `.design-sync/config.json` immediately.
2. Empty project → incremental path; otherwise atomic. Build is ready in
   `ds-bundle/`. Re-run the driver right before upload so `.sync-diff.json` is fresh.
3. Upload per the package SKILL §5 (writes = everything; deletes = [] for a fresh
   project), sentinel-fenced, `_ds_sync.json` last.

## Re-sync risks (what can silently go stale)

- **`dtsPropsFor` drift:** hand-written props won't track source prop changes.
  Re-check against the components if their APIs change.
- **Inlined preview data:** FAQ/stat/card copy in `previews/*.tsx` and the artist
  card titles/glows are snapshots of `apps/web/data/homepageLaunchCopy.ts`; they
  won't auto-update. Refresh if the homepage copy changes materially.
- **Screenshot assets:** `gen-images.mjs` reads fixed filenames from
  `apps/web/public/product-screenshots/` + `/brand-logos/`. If those are renamed,
  gen-images throws — update the `MAP`/`PUBLIC_ASSETS` filenames.
- **playwright pin:** render check needs `playwright@1.60.0` (pins chromium 1223,
  the build cached at `/opt/pw-browsers`). A different cache build needs a matching
  playwright version.
- **Feature-flag-gated sections:** `HomeBentoPairs`/`HomeLoopDiagramSection`/
  `HomeStatQuoteSection` are gated by `SHOW_HOME_REFRESH_2026` (currently true). If
  the homepage composition changes, re-confirm the scoped component list matches
  what `page.tsx` actually renders.
