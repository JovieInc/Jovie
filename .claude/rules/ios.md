# iOS (Native SwiftUI App)

Operating rules for the native iOS app at `apps/ios` (SwiftUI, dark-only, Clerk-auth, TestFlight via Fastlane). Read this before touching any Swift under `apps/ios/`.

The north star: **rock solid and blazing fast — 0 jank.** Every change should make the existing surface faster or more robust, never add main-thread work, flicker, or layout shift.

## Hard Invariants (Enforced by `scripts/ios-best-practices-lint.sh`)

The guardrail lint runs in `ios-ci.yml` and via `pnpm run ios:lint`. It scans production Swift (`apps/ios/Jovie/**`, tests excluded) and **fails the build** on any of these:

| Rule | Blocks | Why | Fix |
|------|--------|-----|-----|
| `no-raw-asyncimage` | `AsyncImage(` | Re-fetches and flashes its placeholder on every appearance; no cross-instance cache → avatar flicker | Use a cached, off-main loader (`AvatarImageCache` + `AvatarImageLoader` in `DashboardView.swift`) |
| `no-coreimage-in-views` | `CIContext(` / `createCGImage(` outside `*Renderer.swift` | CoreImage/CGImage generation is CPU-bound; in a `body` it hitches the first paint | Put it in a dedicated cache-backed `*Renderer.swift` and render via `Task.detached` (see `QRCodeRenderer.imageAsync`) |
| `no-main-thread-blocking` | `DispatchQueue.main.sync`, `Thread.sleep`, `usleep`, `DispatchSemaphore`, `Data(contentsOf:)` | Blocks the render loop → dropped frames | `async`/`await`: `Task`, `URLSession.data`, `Task.sleep` |
| `no-userdefaults-synchronize` | `.synchronize()` | Deprecated; forces a blocking disk flush | Delete it — `UserDefaults` persists automatically |
| `no-print` | `print(` | Invisible in production, ships noise | Use the `Observability` layer |
| `no-force-try` | `try!` | Crashes the whole app on any thrown error | `try?` or `do`/`catch` |

Do **not** add an inline-ignore escape hatch to this lint (same spirit as the web `no biome-ignore` rule). If a rule is genuinely wrong for a case, fix the rule with review — don't suppress it.

## Performance Canon

### Cache-first, stale-while-revalidate

Network-bound screens must paint cached data **instantly**, then revalidate in the background and swap. Never make a returning user wait on a round-trip to see content they already have.

- `MeRepository.cachedSnapshot(for:)` returns the last persisted profile with no network.
- `AppState.handleSignedInUserChange` paints the cache first, then `loadMe` revalidates and swaps.
- `isOffline` is only set when revalidation fails and stale data is retained — a cache paint that is being revalidated is **not** "offline".
- Preserve the dedupe (`loadingUserID`), cancellation (`activeUserID == userID` guards), 401, and sign-out guards on any change to this path. They are covered by `AppStateTests`.

### Image loading

- Decode and downsample **off the main actor** (non-isolated `async` function or `Task.detached`).
- Cache decoded bitmaps process-wide (`NSCache`) keyed by URL, and **seed view `@State` from the cache synchronously in `init`** so a previously-loaded image shows on the first frame (no placeholder flash).
- Downsample to display size (`byPreparingThumbnail`) to keep memory and compositing cheap.

### Heavy rendering

- CoreImage / Core Graphics / PDF / large-bitmap work lives in a dedicated `*Renderer.swift`, is `NSCache`-backed, exposes a `cachedImage(...)` peek and an `imageAsync(...) async` (via `Task.detached`), and is **never** called from a `body`.

## Layout Shift Prevention (Mandatory)

Same contract as the web app (`.claude/rules/ui.md` → "Layout Shift Prevention"), applied to SwiftUI. Before editing any view, enumerate every visual state it can render (loading, empty, error, partial, success, offline, signed-out, etc.) and verify **no state transition shifts layout**:

- Reserve space for conditional content up front. For async media, use a fixed `aspectRatio` + `frame(maxWidth:)` container that exists in every state (see `QRCodeCardView` — square footprint reserved while the QR renders).
- Skeletons must mirror the loaded layout's dimensions and alignment so skeleton → loaded does not jump (see `DashboardView.skeleton`).
- Prefer `opacity`/`transition(.opacity)` for content swaps; never animate `height`/`margin` in a way that reflows siblings.
- No decorative spatial motion (translate/scale/lift) for hover/press polish — match the web taste rule.

## Verification (Before Claiming Done)

- `pnpm run ios:lint` — guardrail lint (fast, no simulator).
- `pnpm run ios:test` — builds + runs unit/UI tests on a simulator (`apps/ios/scripts/run-xcodebuild.sh`).
- New behavior gets a unit test; new view state gets a layout-shift check. Tests live in existing files under `apps/ios/JovieTests/` unless a new file is added to `project.pbxproj` (the project does **not** use synchronized file groups — new files require explicit pbxproj entries, so prefer extending existing files).
- The local `Configuration.local.plist` is generated and gitignored (`apps/ios/scripts/ensure-configuration.sh`); never commit it.

## Company-Wide Portability (Apply These Guardrails to Every iOS-Touching Repo)

`scripts/ios-best-practices-lint.sh` is intentionally self-contained and portable — it takes a target directory and has no repo-specific dependencies. Any company repo that ships iOS/SwiftUI code must run it:

1. Vendor `scripts/ios-best-practices-lint.sh` into the repo (copy as-is).
2. Add a CI step before the Swift build: `bash scripts/ios-best-practices-lint.sh <swift-source-dir>` (mirror the `iOS best-practices lint` step in `.github/workflows/ios-ci.yml`).
3. Add a `pnpm run ios:lint` (or equivalent) pointing at the repo's Swift source dir.
4. Adopt the performance canon and layout-shift rules above in that repo's agent rules.

Verify a local checkout with `pnpm run ios:guardrail:audit -- <repo-path>`. The audit fails if an iOS-touching repo is missing the vendored lint script, an explicit Swift-source lint entrypoint, a pre-build CI step, or the canon in its agent rules.

Rollout to other repos is tracked in Linear (this repo cannot edit other repos). When standing up iOS code in a new repo, copy the lint and wire the CI step in the same PR — do not ship SwiftUI without the guardrail.
