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

## Release

Fastlane lives at the repo root.

```bash
bundle exec fastlane ios ios_tests
bundle exec fastlane ios screenshots
bundle exec fastlane ios bootstrap_signing
bundle exec fastlane ios beta
```

Release CI uses these GitHub secrets: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`, `MATCH_GIT_URL`, `MATCH_PASSWORD`, one of `MATCH_GIT_PRIVATE_KEY` or `MATCH_GIT_BASIC_AUTHORIZATION`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `CLERK_ASSOCIATED_DOMAIN`.

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
