# ADR: One Swift data architecture (main thread is for frames only)

> Date: 2026-10-29
> Scope: every JovieInc Swift app: Jovie iOS (`apps/ios/Jovie`), shared `JovieKit`
> (`apps/ios/Packages/JovieKit`), native Mac (`apps/ios/JovieMac`),
> `apps/macos/MenuMonitor`, and LogYourBody iOS (`JovieInc/LogYourBody/apps/ios`, which vendors the same guard).
> Founder ask: the main thread must never be blocked by anything nonessential. Deliver data
> efficiently, so a one-value update never re-renders a whole screen. Agents follow one architecture,
> and machines enforce it.
> Enforcement: `scripts/swift-arch/guard.mjs`, with its baseline ratchet in `scripts/swift-arch/baseline.json`.
> Sibling: the web data architecture ADR (`docs/architecture/data-architecture-adr-2026-10-29.md`).

## Evidence (measured 2026-10-29)

- **Production hangs: all of them are in LogYourBody.**
  - Sentry, last 30 days: 13 `App Hanging ≥2000 ms` issues, all in `log-your-body-ios`, and 0 in Jovie iOS. JOV-8646 is a LogYourBody event filed without a project.
  - Every hang with an in-app frame is derived data computed inside `View.body`:
    - `DashboardViewLiquid.fullMetricChartView.getter` calls `MetricsInterpolationService.estimateTrendWeight` and `estimateFFMI` once per card. Each call rebuilds the context (filter and sort over the full history) and replays the EMA from the first weigh-in.
    - `HomeV2TrendChart.pointMarks` calls `HomeV2ChartIntegrity.filter`.
    - `BodyMetrics.__derived_struct_equals` compares the full history on each render.
  - Seven earlier PRs patched these one call site at a time (#1326, #1407, #1408, #1445 and others), and the hangs kept returning. The pattern is the bug.
- **Jovie iOS strict concurrency.** The app builds clean under `SWIFT_STRICT_CONCURRENCY=complete` with 35 concurrency diagnostics:
  - 11 come from static or global mutable state;
  - 20 come from main-actor isolation crossings;
  - 4 are `sending` races.
  - Every target is in Swift 5 language mode, and no target sets strict concurrency.
- **Guard baseline at adoption:** Jovie has 72 identities across 104 files, and LogYourBody has the count recorded in its own baseline. The main-actor Keychain reads in the launch, unlock and push paths and the `ObservableObject` holdouts are listed there by file.

## Decisions

Each decision states **Ship now / Re-evaluate when / Then**.

### 1. Observation: `@Observable` only

- Stores are `@MainActor @Observable final class` types, one per feature surface (examples: `AppState`, `ChatRepository`, `MobileHomeDataStore`).
- How views hold a store:
  - the owner uses `@State`;
  - a child takes a plain `let` or `@Bindable`;
  - shared stores come from `@Environment(Store.self)`.
- No new `ObservableObject`, `@Published`, `@StateObject`, `@ObservedObject` or `@EnvironmentObject`. Observation tracks per property: a view re-renders only when a property its `body` actually read changes. `@Published` re-renders every observer on any change.
- A hot field that changes many times a second must not invalidate its parents. Examples are streaming text, scroll offset, timers and audio levels. Put it in its own small observable, or read it only in the leaf view that shows it.
- Row views take value types (`Identifiable & Equatable & Sendable` structs) with stable ids. A row that also receives closures conforms to `Equatable` on its data and is wrapped in `.equatable()`, so closures do not defeat diffing.
- Ship now. Re-evaluate when Apple ships a successor to Observation. Then migrate with the same ratchet.

### 2. Actor isolation: the main actor applies results, it does not compute them

- UI types and stores are `@MainActor`. Main-actor work is limited to:
  - assigning finished values to state;
  - layout;
  - cheap formatting with hoisted formatters or `FormatStyle`.
- Everything else runs off the main actor: network, JSON, disk, `UserDefaults` blobs, Keychain, image decode and resize, Core Data fetch and save, parsing, sorting, interpolation and chart preparation. Use one of three places:
  - a `nonisolated async` function on a `Sendable` type;
  - an `actor`, such as `MeCache` or `ChatCache`;
  - `Task.detached`, for one-off CPU work.
- `Task {}` inside a view or store inherits the main actor. Use it only to orchestrate (`await` off-main work, then assign). Never use it to run heavy work.
- `DispatchQueue.main.sync`, semaphores and `Thread.sleep` are banned (existing lint). Use `await MainActor.run {}` or `@MainActor` callees instead of `DispatchQueue.main.async`.
- **Derived data is computed once per data change, never per render.** No `body` and no computed property read by `body` may filter, sort, interpolate or aggregate a collection. The store computes a snapshot when its inputs change. When a pure function must be called from rendering, memoize it on a content fingerprint of exactly the fields it reads, as `MetricsInterpolationService` does after this ADR.
- Ship now. Re-evaluate when the Swift 6.2 `NonisolatedNonsendingByDefault` mode is adopted, because nonisolated async functions then inherit the caller's actor. Then audit off-main helpers to use `@concurrent` or `Task.detached`.

### 3. Networking and decoding: one client per app, decoded off main

- There is one `Sendable` API client struct per app (`APIClient` / `MobileChatClient` in Jovie). It has `nonisolated async` methods and one `JSONDecoder` configured at init. It returns `Sendable` `Codable` domain values, never raw `Data`, to the main actor.
- Streams (NDJSON, SSE) are consumed off main and coalesced before they reach the store, at a bounded rate. `MobileChatStreamCoalescer` is the reference implementation.
- Push over polling: use server streams, APNs, HealthKit observer queries and notifications. A poll needs a documented reason, a cancellable `.task`, and backoff.
- Ship now. Re-evaluate when a shared `JovieKit` networking slice exists. Then the clients move there unchanged.

### 4. Caching and persistence

- **Stale-while-revalidate is the read path.** Paint the cached snapshot first, then revalidate and swap. The full contract is in `.claude/rules/ios.md` → Cache-first.
- **Snapshots live in an `actor` cache** that does its own encode, decode and `UserDefaults` I/O (`MeCache`, `ChatCache`, `ActionLoopCache`). Snapshots stay bounded (`ChatTranscriptWindow.persistedTail`).
- **Keychain** sits behind a single locked store. Main-actor callers use the async off-main variant (`NativeSessionTokenStore.loadOffMainActor()`). The guard lists configured blocking calls in `extraMainActorCalls`.
- **Images** are decoded and downsampled off main and cached in an `NSCache`. View state is seeded from the cache in `init`. The detail is in the existing canon.
- **Core Data (LogYourBody)** has three rules:
  - `viewContext` is main-queue and serves small UI-bound reads only;
  - dashboard and history fetches and all writes run on background contexts (`performBackgroundTask` / `newBackgroundContext`);
  - the main actor receives value snapshots and merges via `automaticallyMergesChangesFromParent`.

  SwiftData is not adopted.
- Ship now. Re-evaluate when LogYourBody's background-context migration lands, which ratchet rule `main-actor-core-data` tracks. Then make that rule zero-tolerance.

### 5. Mutations update only affected state

- **Mutate by id.** A mutation finds the item by id and replaces that one value (`items[index] = updated`). It applies optimistically, calls the server, and reconciles by id. It never refetches or reassigns a whole screen's collection for one value.
- **Server responses that echo the mutated entity replace just that entity.** A list refetch happens only on explicit refresh or when the cache is invalid.
- **Equality must be cheap.** Collections that SwiftUI diffs are identified by `id`. A large model with heavy fields, such as `BodyMetrics.sourceMetadata`, gets a cheap `version` or `updatedAt` for change detection, rather than a synthesized deep `==` evaluated per render.
- Ship now. Re-evaluate when a sync engine (CRDT or server push of deltas) is introduced. Then deltas apply through the same by-id path.

### 6. Swift concurrency settings

- **New modules use Swift 6 language mode.** This covers packages, targets and the native Mac targets: `swift-tools-version: 6.x`, with no `.v5` language mode.
- **Existing targets ratchet to complete.** Each build configuration and package below complete strict checking counts against rule `strict-concurrency-not-complete`, and that count may only shrink. The order is `targeted`, then `complete`, then Swift 6 per target, starting with `JovieKit` and `MenuMonitor`.
- **Measure:** run `SWIFT_STRICT_CONCURRENCY=complete` locally (`xcodebuild build ... SWIFT_STRICT_CONCURRENCY=complete`) and record the diagnostic count in the PR.
- Ship now. Re-evaluate when the Jovie iOS complete-mode diagnostic count reaches 0. Then flip the app target to Swift 6 and remove its baseline entries.

### 7. Measurement and self-healing

- **In production:**
  - Sentry app-hang tracking stays at 2.0 s (`SentryHangTrackingPolicy`);
  - MetricKit hang and launch diagnostics are on (`MetricKitReporter`);
  - LogYourBody uses the same Sentry policy.
- **In CI:** `node scripts/swift-arch/guard.mjs` runs in the cheap Linux `ios-fast` lane through `pnpm run ios:lint`, on no Mac minutes. It fails on any new identity. It also fails on a stale-high baseline, so the PR that fixes debt locks the lower count in.
- **The sweep:** the weekly `remediation-sweep` `swift-arch` mode files and updates one Linear issue per rule with debt, through the existing upsert-by-fingerprint intake. It uploads `swift-arch-metrics.json` (schema `jovie.swift-arch-metrics/v1`) as a timestamped run record.
- Ship now. Re-evaluate when production hang events reach 0 for 30 days across both apps. Then lower the Sentry hang threshold to 1.0 s and add a CI hang test on the self-hosted Mac lane.

## Non-goals

- Rewriting large views in one PR. Debt shrinks through the ratchet, hot paths first, by measured production impact.
- An inline-ignore escape hatch. If a rule is wrong, fix the rule with review (same stance as `ios-best-practices-lint.sh`).
