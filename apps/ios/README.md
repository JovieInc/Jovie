# Jovie iOS

Native iOS foundation for Jovie. The app is dark-only, simulator-tested, and wired for internal TestFlight distribution through Fastlane match.

## Prerequisites

- Full Xcode with iOS 18 simulator support selected via `xcode-select`
- Clerk native application registered for bundle ID `ie.jov.Jovie`
- Clerk callback scheme `ie.jov.Jovie://callback`
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

3. Open the Xcode project:

   ```bash
   pnpm run ios:open
   ```

4. Run tests:

   ```bash
   pnpm run ios:test
   ```

5. Capture the core screenshot flows:

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
- The committed entitlements file uses `$(CLERK_ASSOCIATED_DOMAIN)`. If Clerk rotates hosts, update the GitHub secret and local config before expecting native auth to work.
- Do not add `applinks:jov.ie` for this MVP. The web handoff opens Safari directly.
