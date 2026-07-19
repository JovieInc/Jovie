# Jovie iOS

Native iOS foundation for Jovie. The app is dark-only, simulator-tested, and wired for internal TestFlight distribution through Fastlane match.

## Prerequisites

- Full Xcode with iOS 18 simulator support selected via `xcode-select`
- Clerk native application registered for bundle ID `ie.jov.Jovie`
- iOS URL scheme `ie.jov.jovie`; native auth completes at `ie.jov.jovie://auth/complete`
- Associated Domains set to `webcredentials:{CLERK_FRONTEND_API_HOST}`
- Doppler access to `jovie-web/dev`

## Local Setup

1. Start the web app:

   ```bash
   pnpm run dev:web:fast
   ```

2. Generate local iOS config:

   ```bash
   pnpm run ios:setup-env
   ```

   The local generator fetches the dev Clerk publishable key from Doppler and
   writes both `API_BASE_URL` and `WEB_BASE_URL` as `http://localhost:3100`
   unless you override them. Keep the Clerk key and web/API origin from the
   same environment; do not point a dev Clerk key at `meetjovie.com` or another
   redirecting alias.

3. Open the Xcode project:

   ```bash
   pnpm run ios:open
   ```

4. Run tests:

   ```bash
   pnpm run ios:test
   ```

   Live Clerk auth tests are skipped by default. To run them locally, use the
   dev Doppler config and allow simulator code signing so Clerk can use the
   keychain. The test wrapper forwards the live-auth environment into XCTest via
   `TEST_RUNNER_*` so the UI test process can read it:

   ```bash
   doppler run --project jovie-web --config dev -- env \
     CODE_SIGNING_ALLOWED=YES \
     JOVIE_IOS_LIVE_AUTH=1 \
     JOVIE_IOS_LIVE_AUTH_UI=1 \
     API_BASE_URL=http://localhost:3100 \
     pnpm run ios:test
   ```

5. Run the iOS auth callback close-loop test:

   ```bash
   pnpm test:auth:ios
   ```

   This runs the callback parser tests plus simulator UI tests that deliver
   `ie.jov.jovie://auth/complete?...` with `xcrun simctl openurl` and assert the
   authenticated shell appears without the sign-in error.

6. Capture the core screenshot flows:

   ```bash
   pnpm run ios:screenshots
   ```

7. Capture launch-performance evidence:

   ```bash
   pnpm run ios:performance
   ```

   This opt-in run measures the signed-out launch shell with
   `XCTApplicationLaunchMetric` and stores the log/result bundle under
   `artifacts/ios-test-results/launch-performance`. Override
   `JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS` only when recording an explicit readiness
   timeout.

8. Capture runtime-performance evidence:

   ```bash
   pnpm run ios:runtime-performance
   ```

   This opt-in run measures the deterministic Chat to Profile to Chat shell
   transition with clock, CPU, and memory metrics, and requests
   `XCTHitchMetric(application:)` on iOS 26+ simulator runtimes. Logs, result
   bundles, and run summaries are stored under
   `artifacts/ios-test-results/runtime-performance`.
   Each summary reports whether measured hitch or frame metric lines were
   emitted by xcodebuild.

9. Capture memory/leak baseline evidence:

   ```bash
   pnpm run ios:memory
   ```

   This builds the debug simulator app, launches the deterministic profile shell,
   attempts to capture a `.memgraph` with Apple's `leaks` tool, and writes
   metadata plus a markdown summary under
   `artifacts/ios-test-results/memory-baseline`. The default run records a
   `sample` footprint even when local Developer Tools settings block memgraph
   capture. Set `JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1` for strict leak-gate runs,
   and override `JOVIE_IOS_MEMORY_LAUNCH_ARGUMENTS` only when recording a
   specific UI-test flow such as `-ui-testing-chat`.

## Release

Fastlane lives at the repo root.

```bash
bundle exec fastlane ios ios_tests
bundle exec fastlane ios screenshots
bundle exec fastlane ios bootstrap_signing
bundle exec fastlane ios beta
```

Release CI uses these GitHub secrets: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`, `MATCH_GIT_URL`, `MATCH_PASSWORD`, one of `MATCH_GIT_PRIVATE_KEY` or `MATCH_GIT_BASIC_AUTHORIZATION`, and `CLERK_ASSOCIATED_DOMAIN`.

The TestFlight workflow validates release config before running Fastlane. The
generated artifact must use the canonical `https://jov.ie` API and web
endpoints. The `beta` lane validates the WRITTEN
`Configuration.local.plist` immediately before archiving and rejects any stale
artifact that still embeds the retired Clerk publishable-key field.

`bootstrap_signing` is intentionally manual. It creates or verifies the Apple bundle identifier, enables Associated Domains, creates or verifies the App Store Connect app record, and writes App Store distribution assets into match storage. Normal TestFlight uploads use readonly match in CI.

## Notes

- `apps/ios/Jovie/Configuration.local.plist` is generated and gitignored.
- Local API traffic defaults to `http://localhost:3100`, so `Info.plist` includes `NSAllowsLocalNetworking`.
- Real-device and TestFlight auth must use one canonical HTTPS environment for
  both `WEB_BASE_URL` and `API_BASE_URL`, for example `https://jov.ie` in
  production or `https://staging.jov.ie` for staging. If you test an HTTPS
  tunnel, set both values to the same tunnel origin and use the matching Clerk
  publishable key.
- The committed entitlements file uses `$(CLERK_ASSOCIATED_DOMAIN)`. If Clerk rotates hosts, update the GitHub secret and local config before expecting native auth to work.
- Do not add `applinks:jov.ie` for this MVP. iOS auth uses the custom scheme
  callback above; the committed entitlements intentionally keep only Clerk
  `webcredentials`.
