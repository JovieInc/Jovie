# Jovie iOS

Native iOS MVP for Jovie. This target is simulator-ready and intentionally stops short of TestFlight, signing, and push setup.

## Prerequisites

- Full Xcode with iOS 18 simulator support selected via `xcode-select`
- Clerk native application registered for bundle ID `ie.jov.Jovie`
- Clerk callback scheme `ie.jov.Jovie://callback`
- Associated Domains set to `webcredentials:{CLERK_FRONTEND_API_HOST}`
- Doppler access to `jovie-web/dev`

## Local Setup

1. Start the web app:

   ```bash
   pnpm run dev:web:local
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

## Notes

- `apps/ios/Jovie/Configuration.local.plist` is generated and gitignored.
- Local API traffic defaults to `http://localhost:3100`, so `Info.plist` includes `NSAllowsLocalNetworking`.
- The committed entitlements file currently uses the repo's Clerk Frontend API host. If Clerk rotates hosts, update `Jovie.entitlements` before expecting native auth to work.
- Do not add `applinks:jov.ie` for this MVP. The web handoff opens Safari directly.
