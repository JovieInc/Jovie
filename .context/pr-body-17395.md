## Summary

- bundle the Electron preload into one CommonJS file before every desktop launch, build, and package path
- preserve `sandbox: true` and `contextIsolation`; only Electron's supported `electron` module remains external
- pin the release-critical bundler to esbuild `0.28.2`
- execute both a fixture bundle and the real production output under a fail-closed sandbox module allowlist

## Root cause

Electron 44 rejected `require("./build-identity.generated")` at packaged preload startup. The top-level failure happened before `contextBridge.exposeInMainWorld`, so the titlebar fell back to `Version Unknown · Unverified` and the renderer could not call the app-booted watchdog bridge.

## Bug-to-test

`preload-bundle.test.mjs` copies the real preload source beside a generated identity fixture, executes its bundle with only `require("electron")` allowed, and calls both `getBuildIdentity` and `notifyAppBooted`. A second regression deletes and regenerates the real `dist-electron/preload.js` production output, preventing a stale unbundled artifact or wrong output path from passing.

## Test coverage

- `bundle-preload.mjs`: 88.57% lines, 60.00% branches, 100% functions
- `preload-bundle.test.mjs`: 99.20% lines, 92.31% branches, 83.33% functions
- combined focused slice: 96.88% lines, 83.33% branches, 85.71% functions

## Pre-landing review

- independent adversarial review found two fixable proof gaps: the regression bypassed the production outfile, and esbuild could float across pre-1.0 versions
- both are closed by the real-output regression and exact `0.28.2` pin
- the remaining Electron-specific concern is covered by native packaged-app readback rather than the Node VM alone

## Verification

- `pnpm --filter @jovie/desktop test` — pass, including the three preload bundle regressions
- `pnpm --filter @jovie/desktop run typecheck` — pass
- `node --experimental-test-coverage --test apps/desktop/scripts/preload-bundle.test.mjs` — pass with coverage above
- `pnpm exec node scripts/lockfile-specifier-preflight.mjs` — pass
- `pnpm install --filter @jovie/desktop... --frozen-lockfile --lockfile-only` — pass
- source CI [34052081825](https://github.com/JovieInc/Jovie/actions/runs/34052081825) — green at exact head `381a2462b9fee32a7698e20914ac431caf4bb80e`
- exact-head hosted Mac workflow [34052407378](https://github.com/JovieInc/Jovie/actions/runs/34052407378) — blocked before the Mac lane by an existing manual-dispatch `Path Changes` bug: `changed-paths.txt` is not created before the homepage selector requires it

## Packaged artifact proof

- exact-head Local ASAR: `03ed65b516c231f6787ae91e80613c5e49d40499785f5ee42255892e9a5937c1`
- exact-head Production ASAR: `f89e26bf8fbfbac9df9b0e69c2b2bb99c7bbc9fa8685bd60e6a4f3b4a4d9f106`
- both pass strict/deep code-sign verification; extracted preloads require only `electron`
- predecessor `07fe36a` passed native Local and Production launch, authenticated identity banner, native Go Back, and stable Ovie route
- exact `381a246` native launch readback is pending because the Mac was locked; installed apps were not replaced

## Design review

No rendered UI changed. The repair restores the existing build-identity and app-boot bridge without changing layout or interaction design.

## Scope

Six files only: desktop scripts/package manifest, one focused test, root bundler pin, and lockfile. No migration, auth, billing, deployment, or installed-app mutation.
